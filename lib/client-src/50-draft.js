let commandParserClient = null
function getCommandParser(cfg) {
  if (cfg)
    return createCommandParser({
      commands: cfg.voice_control.commands,
      mode: cfg.voice_control.command_mode,
      wakePrefix: cfg.voice_control.wake_prefix,
      wakeWords: cfg.voice_control.wake_words
    })
  return createCommandParser({
    commands: chattySetting('voice_control.commands', DEFAULT_COMMANDS),
    mode: chattySetting('voice_control.command_mode', 'exact'),
    wakePrefix: chattySetting('voice_control.wake_prefix', 'DSH'),
    wakeWords: chattySetting('voice_control.wake_words', [])
  })
}
function getVoiceBuffer() {
  return chatty.ledger?.text() || ''
}
function resetVoiceSession() {
  chatty.ledger = null
}
async function handleRecognizedText(text, task) {
  if (task.cfg.voice_control.enabled) {
    const parsed = getCommandParser(task.cfg).parse(text)
    if (parsed) {
      if (
        ['send', 'undo', 'clear', 'polish'].includes(parsed.command) &&
        !chatty.ledger?.rebase(task.anchor)
      ) {
        chatty.pendingResults.push({ id: task.id, text })
        showNotice('草稿已变化，口令未执行，结果已保留')
        chatty.notify()
        return { command: null, conflict: true }
      }
      await runVoiceCommand(parsed.command)
      return { command: parsed.command }
    }
  }
  if (!chatty.ledger?.insert(text, task.anchor, task.cfg.draft.separator)) {
    chatty.pendingResults.push({ id: task.id, text })
    showNotice('草稿已变化，识别结果保留在下方')
  }
  chatty.notify()
  return { command: null }
}
function appendRecognized(text) {
  const anchor = chatty.ledger?.capture()
  if (anchor)
    chatty.ledger.insert(text, anchor, chattySetting('draft.separator', '\n'))
}
function undoLastInsert() {
  showNotice(
    chatty.ledger?.undo() ? '已撤销语音插入' : '无法可靠追踪，请使用输入框撤销'
  )
  chatty.notify()
}
function clearVoiceInserts() {
  showNotice(
    chatty.ledger?.clear() ? '已清除可追踪语音内容' : '草稿已变化，保留内容'
  )
  chatty.notify()
}
async function polishComposer() {
  if (chatty.busy) return
  if (!chattySetting('polish.enabled', true)) return
  const records = chatty.ledger?.records() || []
  if (!records.length) {
    showNotice('没有可追踪语音内容')
    return
  }
  const groups = []
  for (const r of records) {
    const last = groups.at(-1)
    if (last && last.end === r.start) {
      last.end = r.end
      last.text += r.text
    } else groups.push({ ...r })
  }
  let record = groups[0]
  if (groups.length > 1) {
    const answer = window.prompt(
      '请选择润色段号（1-' + groups.length + '）',
      '1'
    )
    record = groups[Number(answer) - 1]
    if (!record) return
  }
  record = { ...record, rev: chatty.ledger.capture().draftRev }
  const ledger = chatty.ledger,
    sessionId = chatty.sessionId
  const epoch = ledger.epoch()
  const controller = new AbortController()
  chatty.polishController = controller
  chatty.busy = 'polish'
  chatty.notify()
  try {
    const result = await postJson(
      '/dsh-chatty/draft',
      {
        action: 'polish',
        sessionId: chatty.sessionId,
        text: record.text
      },
      { signal: controller.signal }
    )
    if (
      controller.signal.aborted ||
      chatty.ledger !== ledger ||
      chatty.sessionId !== sessionId
    )
      return
    const text = result.draft.text
    if (
      epoch !== chatty.ledger?.epoch() ||
      !chatty.ledger.replace(text, { ...record, draftRev: record.rev, epoch })
    ) {
      chatty.pendingResults.push({ id: 'polish:' + Date.now(), text })
      showNotice('草稿已修改，润色结果已保留')
    }
  } catch (error) {
    if (!controller.signal.aborted) showNotice(String(error.message))
  } finally {
    if (chatty.polishController === controller) {
      chatty.polishController = null
      chatty.busy = ''
    }
    chatty.notify()
  }
}
function sendComposer() {
  if (!chatty.inputActions) return
  chatty.inputActions.submit()
}
async function insertPending(index) {
  const item = chatty.pendingResults[index]
  if (!item || !chatty.ledger) return
  if (item.unconfirmed) {
    showNotice('临时结果未经确认，请重试本句')
    return
  }
  if (chatty.ledger.insert(item.text, chatty.ledger.capture(), '')) {
    chatty.pendingResults.splice(index, 1)
    chatty.notify()
  }
}
async function retryPending(index) {
  const item = chatty.pendingResults[index]
  if (!item?.retry || item.busy) return
  const task = item.retry
  const controller = new AbortController(),
    generation = sttClient.generation
  item.busy = true
  sttClient.retries ||= new Set()
  sttClient.retries.add(controller)
  try {
    const result = await postJson(
      '/dsh-chatty/stt/transcribe',
      {
        sessionId: task.sessionId,
        providerId: task.cfg.stt.provider,
        language: task.cfg.stt.language,
        audioBase64: bytesToBase64(
          pcm16ToWavClient(concatPcm(task.chunks), 16000)
        )
      },
      { signal: controller.signal }
    )
    if (
      controller.signal.aborted ||
      generation !== sttClient.generation ||
      task.sessionId !== chatty.sessionId
    )
      return
    item.text = result.text
    item.unconfirmed = false
    delete item.retry
    chatty.notify()
  } catch (error) {
    if (!controller.signal.aborted) showNotice(String(error.message))
  } finally {
    item.busy = false
    sttClient.retries.delete(controller)
  }
}
async function runVoiceCommand(command) {
  if (command === 'send') sendComposer()
  else if (command === 'undo') undoLastInsert()
  else if (command === 'clear') clearVoiceInserts()
  else if (
    command === 'polish' &&
    chattySetting('draft.polish_on_command', true)
  )
    await polishComposer()
  else if (command === 'stop_listening') await stopListening()
  else if (command === 'read') await readLatestReply()
  else if (command === 'stop_reading') stopSpeaking()
}
