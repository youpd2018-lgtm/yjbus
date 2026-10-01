// GAS 웹 앱 주소는 js/app-config.js 에서 설정합니다 (window.GAS_WEB_APP_URL)
if (typeof google === 'undefined') window.google = {};
if (!google.script) google.script = {};

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
      loadFromServer: function() {
        const url = window.GAS_WEB_APP_URL + "?action=load_from_server";
        fetch(url)
          .then(res => res.json())
          .then(data => {
            const dbData = (data && data.data) ? data.data : (data || {});
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
      getStandardMasterForLiveByKey: function(uniqueKey) {
        const url = window.GAS_WEB_APP_URL + "?action=get_standard_master&uniqueKey=" + encodeURIComponent(uniqueKey || '');
        fetch(url).then(res => res.json()).then(data => {
            if (successHandler) successHandler(data || { success: false, data: [] });
        }).catch(err => {
            if (failureHandler) failureHandler(err);
            else if (successHandler) successHandler({ success: false, data: [] });
        });
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