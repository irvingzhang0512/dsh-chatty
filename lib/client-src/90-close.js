    // ── 注册 ──────────────────────────────────────────────────────────
    function registerChattySlots(ctx) {
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
        { name: 'conversation.input.right', id: PKG, order: 7, locale: NS, label: () => t('barSlot') },
        (props) => React.createElement(VoiceBar, {
          sessionId: props.sessionId,
          input: props.input,
          inputActions: props.inputActions,
        }),
      ))
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
        { name: 'conversation.input.dock', id: 'dsh-chatty-draft', order: 1, locale: NS, label: () => t('draftSlot') },
        (props) => React.createElement(DraftPanel, {
          input: props.input,
          inputActions: props.inputActions,
        }),
      ))
    }

    exports.inject = ['timer', 'slots', 'settingsScope', 'locale', 'uiSession']
    exports.apply = function apply(ctx) {
      installChattyStyle()

      // 文案注册：英文兜底，中文（zh / zh-CN）为默认展示。
      const addLocale = (locale, dictionary) => {
        try { return ctx.locale.register(NS, locale, dictionary) } catch { return () => {} }
      }
      ctx.effect(() => {
        const undo = [addLocale('en', en), addLocale('zh', zh), addLocale('zh-CN', zh)]
        return () => { for (const off of undo) off() }
      }, 'dsh-chatty: locale dictionaries')
      moduleT = ctx.locale.bind(NS)

      // 设置保存后立刻按新配置生效：自动朗读连接、VAD 参数、可视化。
      ctx.effect(() => {
        const reload = () => {
          refreshChattySettings().then((settings) => {
            if (!settings) return
            audioEngine.configure(chattySetting('stt.vad', null))
            if (chattySetting('tts.auto_read', false)) connectSpeechEvents(chatty.sessionId)
            else disconnectSpeechEvents()
          })
        }
        window.addEventListener('dsh-chatty:settings-saved', reload)
        return () => window.removeEventListener('dsh-chatty:settings-saved', reload)
      }, 'dsh-chatty: reload settings')

      registerChattySlots(ctx)
      registerSettings(ctx)

      ctx.effect(() => () => {
        try { stopListening() } catch { /* 未在监听 */ }
        try { stopSpeaking(true) } catch { /* 未在播放 */ }
        disconnectSpeechEvents()
      }, 'dsh-chatty: release audio resources')
    }
    return module.exports
  },
})
