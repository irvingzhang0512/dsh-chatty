    // ── 听写直写（v0.4）：插件自持「语音文本缓冲」作为唯一事实源 ──────
    //
    // DSH 契约限制（已查实）：composer 文本存在 Lexical 编辑器里，slot 拿到的
    // props.input 是提交状态机（不含文本），InputActions 只有 setDraft（整段替换）
    // / attachments / submit——没有读取接口。所以「读输入框 → 追加」不可能正确，
    // 改为插件自持 voiceBuffer：
    //   - 追加：appendSegment(buffer, text) → setDraft(buffer)（连续多句自然叠加）；
    //   - 撤销：revertLastInsert(buffer, history) → setDraft(buffer)（数据全在插件侧，必然可靠）；
    //   - 清空：buffer 清空 + setDraft('')；
    //   - 润色：对 buffer 全文调用宿主 /draft polish → 回写；
    //   - 发送：inputActions.submit() 后清空 buffer（语音指令路径）。
    // 已知取舍：监听中手动点发送、不停止监听就继续说，旧内容会被重新写回——
    // 用语音指令「发送」或停止监听后手动发送可避免（dock 条有提示）；
    // 重新开始监听（主按钮从停止到开始）时会清空 buffer，开始新一段。

    const insertHistory = []   // [{ before, added, start, end }]，上限 50
    const INSERT_HISTORY_LIMIT = 50

    let commandParserClient = null
    function getCommandParser() {
      if (commandParserClient) return commandParserClient
      const cfg = chattySetting('voice_control', null) || {}
      commandParserClient = createCommandParser({
        commands: cfg.commands,
        mode: cfg.command_mode || 'exact',
        wakePrefix: cfg.wake_prefix,
        wakeWords: cfg.wake_words,
      })
      return commandParserClient
    }

    function getVoiceBuffer() { return String(chatty.voiceBuffer || '') }

    function setVoiceBuffer(text) {
      chatty.voiceBuffer = String(text || '')
      chatty.notify()
    }

    function writeComposer(text) {
      const actions = chatty.inputActions
      if (!actions || typeof actions.setDraft !== 'function') {
        showNotice(t('composerUnavailable'))
        return false
      }
      try { actions.setDraft(text); return true } catch { return false }
    }

    /**
     * 一段识别文本的落点：先判指令，是指令执行对应动作；否则追加进语音缓冲。
     * @returns {{ command: string | null }}
     */
    async function handleRecognizedText(text) {
      const control = chattySetting('voice_control', null) || {}
      if (control.enabled !== false) {
        const parsed = getCommandParser().parse(text)
        if (parsed) {
          showNotice(t('command', { name: parsed.phrase || parsed.command }))
          await runVoiceCommand(parsed.command)
          return { command: parsed.command }
        }
      }
      appendRecognized(text)
      // 语音对话模式（🗣）或配置了自动发送时：说完直接提交，回复由宿主自动朗读。
      if (chatty.voiceChat === true || chattySetting('draft.auto_send', false)) sendComposer()
      return { command: null }
    }

    /** 把一段识别结果追加进语音缓冲并写入输入框（记录插入历史供撤销）。 */
    function appendRecognized(text) {
      const before = getVoiceBuffer()
      const result = appendSegment(before, text, '\n')
      const record = recordInsert(before, result)
      if (!writeComposer(result.text)) return
      setVoiceBuffer(result.text)
      if (record) {
        insertHistory.push(record)
        while (insertHistory.length > INSERT_HISTORY_LIMIT) insertHistory.shift()
      }
    }

    /** 开始新一轮监听：清空语音缓冲，避免旧内容被写回新一段。 */
    function resetVoiceSession() {
      if (getVoiceBuffer() === '' && insertHistory.length === 0) return
      insertHistory.length = 0
      setVoiceBuffer('')
      chatty.notify()
    }

    /** 撤销最后一段语音（连续调用逐段回退）。 */
    function undoLastInsert() {
      const before = getVoiceBuffer()
      const reverted = revertLastInsert(before, insertHistory)
      if (!reverted.removed) { showNotice(t('nothingToUndo')); return }
      setVoiceBuffer(reverted.text)
      writeComposer(reverted.text)
      showNotice(t('undone'))
    }

    /** 清空全部语音内容。 */
    function clearVoiceInserts() {
      insertHistory.length = 0
      setVoiceBuffer('')
      writeComposer('')
      showNotice(t('cleared'))
    }

    /** 润色：对语音缓冲全文调用宿主 LLM 润色后回写。 */
    async function polishComposer() {
      const source = getVoiceBuffer().trim()
      if (!source) { showNotice(t('draftEmpty')); return }
      chatty.busy = 'polish'
      chatty.notify()
      try {
        const payload = await postJson('/dsh-chatty/draft', {
          sessionId: chatty.sessionId || 'default',
          action: 'polish',
          text: source,
        })
        const polished = (payload.draft && payload.draft.text) || payload.text || source
        setVoiceBuffer(polished)
        writeComposer(polished)
        showNotice(t('polished'))
      } catch (polishError) {
        showNotice(String(polishError && polishError.message || polishError))
      } finally {
        chatty.busy = ''
        chatty.notify()
      }
    }

    /** 发送：提交输入框内容，并清空语音缓冲（下一句从零开始）。 */
    function sendComposer() {
      if (!chatty.inputActions || typeof chatty.inputActions.submit !== 'function') {
        showNotice(t('composerUnavailable'))
        return
      }
      try {
        chatty.inputActions.submit()
      } catch (submitError) {
        showNotice(String(submitError && submitError.message || submitError))
        return
      }
      insertHistory.length = 0
      setVoiceBuffer('')
    }

    /** 语音指令 → 客户端动作（指令集见 lib/command-parser.js 的 DEFAULT_COMMANDS）。 */
    async function runVoiceCommand(name) {
      switch (name) {
        case 'send':
          sendComposer()
          break
        case 'undo':
          undoLastInsert()
          break
        case 'clear':
          clearVoiceInserts()
          break
        case 'polish':
          await polishComposer()
          break
        case 'stop_listening':
          await stopListening()
          break
        case 'read':
          await readLatestReply()
          break
        case 'stop_reading':
          stopSpeaking()
          break
        default:
          break
      }
    }
