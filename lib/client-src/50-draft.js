    // ── Voice Draft 客户端（需求 §4.2 / §5 / §6）─────────────────────
    //
    // 宿主是草稿的权威副本，这里只做三件事：
    //   1. 调用 /dsh-chatty/draft 的各种 action；
    //   2. 把返回的草稿镜像到 composer（发送时走 composer.submit()）；
    //   3. 执行语音指令对应的浏览器动作（朗读 / 暂停 / 停止监听）。

    function applyDraftPayload(payload, options = {}) {
      if (!payload) return
      if (payload.draft) chatty.draft = payload.draft
      const effects = Array.isArray(payload.effects) ? payload.effects : []
      if (options.mirror !== false && effects.includes('setDraft')) {
        mirrorDraftToComposer(payload.draft ? payload.draft.text : '')
      }
      chatty.notify()
    }

    async function draftAction(action, extra = {}, options = {}) {
      const payload = await postJson('/dsh-chatty/draft', Object.assign({
        sessionId: chatty.sessionId || 'default',
        action,
      }, extra))
      applyDraftPayload(payload, options)
      return payload
    }

    /** 一个 Utterance 的最终识别结果进入 Voice Draft（绝不自动发送，除非显式配置）。 */
    async function addUtterance(text) {
      const clean = String(text || '').trim()
      if (!clean) return null
      let payload
      try {
        payload = await draftAction('add', { text: clean })
      } catch (error) {
        setSttPhase('ERROR', String(error && error.message || error))
        return null
      }
      if (payload.command) {
        await runVoiceCommand(payload.command)
        return payload
      }
      if (chattySetting('draft.auto_send', false)) await sendDraft()
      return payload
    }

    async function runVoiceCommand(command) {
      const name = command && command.name
      if (!name) return
      showNotice(t('command', { name: command.phrase || name }))
      switch (name) {
        case 'send':
          await sendDraft()
          break
        case 'undo':
          showNotice(t('undone'))
          break
        case 'clear':
          showNotice(t('cleared'))
          break
        case 'cancel':
          showNotice(t('cleared'))
          break
        case 'polish':
          showNotice(t('polished'))
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

    async function sendDraft() {
      const text = String((chatty.draft && chatty.draft.text) || '').trim()
      if (!text) { showNotice(t('draftEmpty')); return }
      chatty.busy = 'send'
      chatty.notify()
      try {
        if (!mirrorDraftToComposer(text)) {
          showNotice(t('composerUnavailable'))
          return
        }
        if (!chatty.inputActions || typeof chatty.inputActions.submit !== 'function') {
          showNotice(t('composerUnavailable'))
          return
        }
        chatty.inputActions.submit()
        showNotice(t('sent'))
        // 发送成功后清空宿主草稿，但不要再镜像回 composer：
        // 用户可能在提交瞬间又敲了后缀，不能被清掉。
        await draftAction('cancel', {}, { mirror: false })
      } catch (error) {
        showNotice(String(error && error.message || error))
      } finally {
        chatty.busy = ''
        chatty.notify()
      }
    }

    async function undoDraft() {
      try {
        const payload = await draftAction('undo')
        showNotice(payload.removed ? t('undone') : t('nothingToUndo'))
      } catch (error) {
        showNotice(String(error && error.message || error))
      }
    }

    async function clearDraft() {
      try {
        await draftAction('clear')
        showNotice(t('cleared'))
      } catch (error) {
        showNotice(String(error && error.message || error))
      }
    }

    async function polishDraft() {
      chatty.busy = 'polish'
      chatty.notify()
      try {
        await draftAction('polish')
        showNotice(t('polished'))
      } catch (error) {
        showNotice(String(error && error.message || error))
      } finally {
        chatty.busy = ''
        chatty.notify()
      }
    }

    async function editDraft(text) {
      try {
        await draftAction('edit', { text })
      } catch (error) {
        showNotice(String(error && error.message || error))
      }
    }

    async function loadDraft() {
      try {
        const payload = await getJson('/dsh-chatty/draft?sessionId=' + encodeURIComponent(chatty.sessionId || 'default'))
        if (payload.draft) { chatty.draft = payload.draft; chatty.notify() }
        return payload.draft
      } catch {
        return null
      }
    }
