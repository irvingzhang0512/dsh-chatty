    // ── 听写直写（v0.3）：composer 即草稿 ────────────────────────────
    //
    // 识别出的最终文本直接追加写进 Session 输入框（保留用户已打的内容），
    // 用户在输入框里编辑、确认、按发送——插件不再维护独立的草稿框。
    //
    // 职责：
    //   1. 指令判定（整句指令，逻辑内联自 lib/command-parser.js，指令表来自 /status）；
    //   2. 追加识别文本（lib/composer-text.js 的 appendSegment，构建时内联）+ 插入历史；
    //   3. 撤销最后一段（按历史回退）、清空语音段落、润色输入框全文、直接提交。
    //
    // 宿主的 /draft 路由只保留 polish 仍被使用；add/edit/undo/clear 已不再走宿主。

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

    function readComposerDraft() {
      return chatty.input && typeof chatty.input.draft === 'string' ? chatty.input.draft : ''
    }

    function setComposerDraft(text) {
      const actions = chatty.inputActions
      if (!actions || typeof actions.setDraft !== 'function') return false
      try { actions.setDraft(text); return true } catch { return false }
    }

    /**
     * 一段识别文本的落点：先判指令，是指令执行对应动作；否则追加进输入框。
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
      if (chattySetting('draft.auto_send', false)) sendComposer()
      return { command: null }
    }

    /** 把一段识别结果追加进输入框并记录插入历史（撤销用）。 */
    function appendRecognized(text) {
      const before = readComposerDraft()
      const result = appendSegment(before, text, '\n')
      const record = recordInsert(before, result)
      if (!setComposerDraft(result.text)) {
        showNotice(t('composerUnavailable'))
        return
      }
      if (record) {
        insertHistory.push(record)
        while (insertHistory.length > INSERT_HISTORY_LIMIT) insertHistory.shift()
      }
      chatty.notify()
    }

    /** 撤销最后一段语音插入（连续调用逐段回退；输入框被手改过的段落跳过）。 */
    function undoLastInsert() {
      const before = readComposerDraft()
      const reverted = revertLastInsert(before, insertHistory)
      if (!reverted.removed) { showNotice(t('nothingToUndo')); return }
      setComposerDraft(reverted.text)
      showNotice(t('undone'))
      chatty.notify()
    }

    /** 清空全部语音插入段（保护用户手打内容：遇到手改段即停）。 */
    function clearVoiceInserts() {
      const before = readComposerDraft()
      const reverted = revertAllInserts(before, insertHistory)
      setComposerDraft(reverted.text)
      showNotice(t('cleared'))
      chatty.notify()
    }

    /** 润色：对输入框全文调用宿主 LLM 润色后回写。 */
    async function polishComposer() {
      const source = readComposerDraft().trim()
      if (!source) { showNotice(t('draftEmpty')); return }
      chatty.busy = 'polish'
      chatty.notify()
      try {
        const payload = await postJson('/dsh-chatty/draft', {
          sessionId: chatty.sessionId || 'default',
          action: 'polish',
          text: source,
        })
        // /draft action=polish 返回 draft.text；/draft/polish 返回 text。
        const polished = (payload.draft && payload.draft.text) || payload.text || source
        setComposerDraft(polished)
        showNotice(t('polished'))
      } catch (polishError) {
        showNotice(String(polishError && polishError.message || polishError))
      } finally {
        chatty.busy = ''
        chatty.notify()
      }
    }

    /** 发送：输入框内容已就绪，直接走 composer 的提交通路。 */
    function sendComposer() {
      if (!chatty.inputActions || typeof chatty.inputActions.submit !== 'function') {
        showNotice(t('composerUnavailable'))
        return
      }
      try {
        chatty.inputActions.submit()
      } catch (submitError) {
        showNotice(String(submitError && submitError.message || submitError))
      }
    }

    /** 语音指令 → 客户端动作（宿主不再参与草稿操作）。 */
    async function runVoiceCommand(name) {
      switch (name) {
        case 'send':
          sendComposer()
          break
        case 'undo':
          undoLastInsert()
          break
        case 'clear':
        case 'cancel':
          clearVoiceInserts()
          break
        case 'polish':
          await polishComposer()
          break
        case 'stop_listening':
          await stopListening()
          break
        case 'pause':
          pauseListening()
          break
        case 'resume':
          resumeListening()
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
