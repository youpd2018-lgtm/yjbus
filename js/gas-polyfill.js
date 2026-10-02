// GAS 웹 앱 주소는 js/app-config.js 에서 설정합니다 (window.GAS_WEB_APP_URL)
if (typeof google === 'undefined') window.google = {};
if (!google.script) google.script = {};

// 🔐 서버(Apps Script) 요청마다 로그인한 이름(u)과 번호(p)를 붙인다. (서버가 확인한 사람에게만 응답)
(function () {
  if (window.__gasAuthFetchPatched) return;
  window.__gasAuthFetchPatched = true;
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!origFetch) return;
  function creds() {
    try {
      var u = JSON.parse(localStorage.getItem('yeongjong_logged_user') || 'null');
      if (u && u.name && u.pin) return { u: String(u.name), p: String(u.pin) };
    } catch (e) { }
    try {
      var n = localStorage.getItem('loggedInUser'), pin = localStorage.getItem('autoLoginPin');
      if (n && pin) return { u: String(n), p: String(pin) };
    } catch (e) { }
    return null;
  }
  window.gasCredentials = creds;
  window.fetch = function (input, init) {
    try {
      var base = window.GAS_WEB_APP_URL;
      var url = (typeof input === 'string') ? input : (input && input.url);
      var c = creds();
      if (base && url && url.indexOf(base) === 0 && c) {
        var method = ((init && init.method) || 'GET').toUpperCase();
        if (method === 'POST' && init && typeof init.body === 'string') {
          try {
            var body = JSON.parse(init.body);
            body.u = c.u; body.p = c.p;
            init = Object.assign({}, init, { body: JSON.stringify(body) });
          } catch (e) { }
        } else if (typeof input === 'string' && url.indexOf('&u=') < 0 && url.indexOf('?u=') < 0) {
          input = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'u=' + encodeURIComponent(c.u) + '&p=' + encodeURIComponent(c.p);
        }
      }
    } catch (e) { }
    return origFetch(input, init);
  };
})();

(function() {
  function createGasBridge() {
    let successHandler = null;
    let failureHandler = null;

    const bridge = {
      withSuccessHandler: function(fn) {
        successHandler = fn;
        return bridgeProxy;
      },
      withFailureHandler: function(fn) {
        failureHandler = fn;
        return bridgeProxy;
      },
      askGeminiVoiceAssistant: function(query, context, history) {
        const payload = {
          action: 'ask_gemini',
          query: query || "",
          context: (context || "").slice(0, 8000),
          history: history || []
        };
        fetch(window.GAS_WEB_APP_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
          if (successHandler) successHandler(data && data.answer ? data.answer : "말씀하신 내용을 확인하지 못했습니다.");
        })
        .catch(err => {
          console.error("GAS Gemini API Error:", err);
          if (failureHandler) failureHandler(err);
        });
        return bridgeProxy;
      },
      // 🔐 로그인(기사번호/비밀번호로 이름 찾기) · 가입 · 사용자 관리 (서버가 확인)
      loginByPin: function(pin) {
        const url = window.GAS_WEB_APP_URL + "?action=login_by_pin&pin=" + encodeURIComponent(pin || '');
        fetch(url).then(res => res.json()).then(res => {
          const raw = res && res.data && res.data['yeongjong_users_db'];
          if (raw) { try { localStorage.setItem('yeongjong_users_db', typeof raw === 'string' ? raw : JSON.stringify(raw)); } catch (e) { } }
          if (successHandler) successHandler(res || { success: false });
        }).catch(err => { if (failureHandler) failureHandler(err); else if (successHandler) successHandler({ success: false, error: 'network' }); });
        return bridgeProxy;
      },
      registerDriver: function(name, pin, phone) {
        const url = window.GAS_WEB_APP_URL + "?action=register_driver&name=" + encodeURIComponent(name || '') + "&pin=" + encodeURIComponent(pin || '') + "&phone=" + encodeURIComponent(phone || '');
        fetch(url).then(res => res.json()).then(res => { if (successHandler) successHandler(res || { success: false }); })
          .catch(err => { if (successHandler) successHandler({ success: false, message: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }); });
        return bridgeProxy;
      },
      registerFamily: function(name, pin, target) {
        const url = window.GAS_WEB_APP_URL + "?action=register_family&name=" + encodeURIComponent(name || '') + "&pin=" + encodeURIComponent(pin || '')
          + "&target=" + encodeURIComponent(target || '');
        fetch(url).then(res => res.json()).then(res => { if (successHandler) successHandler(res || { success: false }); })
          .catch(err => { if (successHandler) successHandler({ success: false, message: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }); });
        return bridgeProxy;
      },
      updateMyPhone: function(phone) {
        const url = window.GAS_WEB_APP_URL + "?action=update_my_phone&phone=" + encodeURIComponent(phone || '');
        fetch(url).then(res => res.json()).then(res => { if (successHandler) successHandler(res || { success: false }); })
          .catch(err => { if (successHandler) successHandler({ success: false, message: '서버에 연결하지 못했습니다.' }); });
        return bridgeProxy;
      },
      adminApproveUser: function(name) {
        const url = window.GAS_WEB_APP_URL + "?action=admin_approve_user&name=" + encodeURIComponent(name || '');
        fetch(url).then(res => res.json()).then(res => { if (successHandler) successHandler(res || { success: false }); })
          .catch(err => { if (successHandler) successHandler({ success: false, message: '서버에 연결하지 못했습니다.' }); });
        return bridgeProxy;
      },
      adminDeleteUser: function(name) {
        const url = window.GAS_WEB_APP_URL + "?action=admin_delete_user&name=" + encodeURIComponent(name || '');
        fetch(url).then(res => res.json()).then(res => { if (successHandler) successHandler(res || { success: false }); })
          .catch(err => { if (successHandler) successHandler({ success: false, message: '서버에 연결하지 못했습니다.' }); });
        return bridgeProxy;
      },
      loadFromServer: function() {
        const url = window.GAS_WEB_APP_URL + "?action=load_from_server";
        fetch(url)
          .then(res => res.json())
          .then(data => {
            const dbData = (data && data.success === false) ? {} : ((data && data.data) ? data.data : (data || {}));
            for (let k in dbData) {
              try {
                const val = typeof dbData[k] === 'object' ? JSON.stringify(dbData[k]) : String(dbData[k]);
                localStorage.setItem(k, val);
              } catch(e) {}
            }
            if (successHandler) successHandler(dbData);
          })
          .catch(err => {
            console.warn("GAS loadFromServer network fallback to localStorage:", err);
            const localDb = {};
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                localDb[k] = localStorage.getItem(k);
              }
            } catch(e) {}
            if (successHandler) successHandler(localDb);
          });
        return bridgeProxy;
      },
      saveToServer: function(key, value) {
        const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
        try { localStorage.setItem(key, strVal); } catch(e) {}
        if (key === 'yeongjong_users_db') { if (successHandler) successHandler({ success: true }); return bridgeProxy; } // 사용자 목록은 서버 전용 함수로만 고친다
        const url = window.GAS_WEB_APP_URL + "?action=save_to_server&key=" + encodeURIComponent(key) + "&value=" + encodeURIComponent(strVal);
        fetch(url).then(res => res.json()).then(res => {
            if (successHandler) successHandler(res || { success: true });
        }).catch(err => {
            if (successHandler) successHandler({ success: true });
        });
        return bridgeProxy;
      },
      fetchBisXml: function(targetBusNo) {
        const url = window.GAS_WEB_APP_URL + "?action=get_initial_data";
        fetch(url).then(res => res.json()).then(data => {
            if (successHandler) successHandler(data && data.busXml ? data.busXml : "");
        }).catch(err => { if (successHandler) successHandler(""); });
        return bridgeProxy;
      },
      keepAlive: function() {
        if (successHandler) successHandler({ success: true });
        return bridgeProxy;
      },
      loadKeyFromServer: function(key) {
        const localVal = localStorage.getItem(key);
        const url = window.GAS_WEB_APP_URL + "?action=load_key_from_server&key=" + encodeURIComponent(key || '');
        fetch(url).then(res => res.json()).then(data => {
            const val = (data && data.value !== undefined) ? data.value : (localVal || "");
            if (val) {
              try { localStorage.setItem(key, typeof val === 'object' ? JSON.stringify(val) : String(val)); } catch(e) {}
            }
            if (successHandler) successHandler(val);
        }).catch(err => {
            if (successHandler) successHandler(localVal || "");
        });
        return bridgeProxy;
      },
      saveKeyToServer: function(key, value) {
        const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
        try { localStorage.setItem(key, strVal); } catch(e) {}
        const url = window.GAS_WEB_APP_URL + "?action=save_key_to_server&key=" + encodeURIComponent(key || '') + "&value=" + encodeURIComponent(strVal);
        fetch(url).then(res => res.json()).then(res => {
            if (successHandler) successHandler(res || { success: true });
        }).catch(err => {
            if (successHandler) successHandler({ success: true });
        });
        return bridgeProxy;
      },
      loadBoardMemo: function(category, targetKey) {
        const localKey = 'board_memo_' + category + '_' + targetKey;
        const localVal = localStorage.getItem(localKey);
        const url = window.GAS_WEB_APP_URL + "?action=load_board_memo&category=" + encodeURIComponent(category || '') + "&targetKey=" + encodeURIComponent(targetKey || '');
        fetch(url).then(res => res.json()).then(data => {
            const content = (data && data.content !== undefined) ? data.content : (localVal || "");
            if (content !== undefined) {
              try { localStorage.setItem(localKey, content); } catch(e) {}
            }
            if (successHandler) successHandler(data || { success: true, content: content });
        }).catch(err => {
            if (successHandler) successHandler({ success: true, content: localVal || "" });
        });
        return bridgeProxy;
      },
      saveBoardMemo: function(category, targetKey, content, writer) {
        const localKey = 'board_memo_' + category + '_' + targetKey;
        try { localStorage.setItem(localKey, content); } catch(e) {}
        const url = window.GAS_WEB_APP_URL + "?action=save_board_memo&category=" + encodeURIComponent(category || '') + "&targetKey=" + encodeURIComponent(targetKey || '') + "&content=" + encodeURIComponent(content || '') + "&writer=" + encodeURIComponent(writer || '');
        fetch(url).then(res => res.json()).then(res => {
            if (successHandler) successHandler(res || { success: true });
        }).catch(err => {
            if (successHandler) successHandler({ success: true });
        });
        return bridgeProxy;
      },
      saveCoreErrorLog: function(payload) {
        if (successHandler) successHandler({ success: true });
        return bridgeProxy;
      },
      getTrafficIncidentLive: function() {
        const url = window.GAS_WEB_APP_URL + "?action=get_traffic_incident";
        fetch(url).then(res => res.json()).then(res => { if (successHandler) successHandler(res || { success: false, incidents: [] }); }).catch(err => {
            if (failureHandler) failureHandler(err);
        });
        return bridgeProxy;
      },
      getTrafficFlowLive: function() {
        const url = window.GAS_WEB_APP_URL + "?action=get_traffic_flow";
        fetch(url).then(res => res.json()).then(res => { if (successHandler) successHandler(res || { success: false, items: [] }); }).catch(err => {
            if (failureHandler) failureHandler(err);
        });
        return bridgeProxy;
      },
      getIncheonBusLive: function(routeShort, targetBusNo) {
        const url = window.GAS_WEB_APP_URL + "?action=get_incheon_bus_live&routeShort=" + encodeURIComponent(routeShort || '') + "&targetBusNo=" + encodeURIComponent(targetBusNo || '');
        fetch(url).then(res => res.text()).then(xml => {
            if (successHandler) successHandler(xml || "");
        }).catch(err => {
            if (failureHandler) failureHandler(err);
        });
        return bridgeProxy;
      }
    };

    const bridgeProxy = new Proxy(bridge, {
      get: function(target, prop) {
        if (prop in target) return target[prop];
        return function(...args) {
          console.log("[GAS Polyfill] Generic handler for:", prop, args);
          setTimeout(() => { if (successHandler) successHandler({ success: true }); }, 0);
          return bridgeProxy;
        };
      }
    });

    return bridgeProxy;
  }

  Object.defineProperty(google.script, 'run', {
    get: function() { return createGasBridge(); },
    configurable: true
  });
})();