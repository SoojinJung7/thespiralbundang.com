/* 홈페이지 실시간 상담 위젯 (손님용) — 필립톡으로 연결된다.
 *
 * 규격: phillip-talk 저장소 specs/WEBCHAT_CONTRACT.md v3.1
 *   · POST {PHILLIPTALK_URL}/api/webchat/message   — 손님 메시지 보내기
 *   · GET  {PHILLIPTALK_URL}/api/webchat/messages  — 답장 폴링(창이 열려 있는 동안 3초)
 *   · 방문자 토큰(web_ + 43자 랜덤)은 localStorage['spiral-chat-token']
 *   · site:'spiral' 을 실어 보낸다 → 필립톡 '더 스파이럴 홈페이지 상담' 채널(관리자 전용)
 *
 * koreapilates.or.kr 의 ChatWidget.astro 를 옮겨온 것. 이 사이트는 빌드가 없는 정적
 * 스냅샷이라, 마크업·스타일을 이 파일이 직접 만들어 붙인다(모든 페이지에 <script> 한 줄).
 */
(function () {
  'use strict';
  if (document.getElementById('sp-chat')) return;

  var API = 'https://to-philip.vercel.app';

  var S = {
    open: '상담 문의',
    title: '더 스파이럴 분당',
    status: '메시지를 남겨주시면 답변드려요',
    close: '닫기',
    intro: '원활한 상담을 위해 성함과 전화번호를 남겨주세요. 상담 중 연결이 끊겨도 남겨주신 번호로 이어서 도와드릴 수 있어요.',
    namePh: '성함',
    contactPh: '전화번호 (예: 010-1234-5678)',
    phoneHint: '전화번호를 정확히 입력해 주세요. (예: 010-1234-5678)',
    start: '상담 시작',
    inputPh: '메시지를 입력하세요…',
    send: '보내기',
    greeting: '안녕하세요! 더 스파이럴 분당입니다 😊 무엇을 도와드릴까요?',
    error: '전송에 실패했어요. 잠시 후 다시 시도해 주세요.',
    edited: '수정됨',
    quicks: ['교육 일정', '수강료', '자이로토닉 레슨', '오시는 길']
  };

  /* 색: 버튼·손님 말풍선 #6b5534 (흰 글자 대비 7:1 이상, 로고의 금갈색 계열) */
  var CSS = [
    '#sp-chat{position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif;-webkit-font-smoothing:antialiased;color:#2a241c;line-height:normal;text-align:left}',
    '#sp-chat *{box-sizing:border-box}',
    '#sp-chat p{margin:0}',
    '.sp-chat-fab{position:relative;display:inline-flex;align-items:center;gap:6px;padding:12px 18px;border:0;border-radius:999px;cursor:pointer;font:inherit;font-size:14px;font-weight:700;letter-spacing:-.01em;color:#fff;background:#6b5534;box-shadow:0 10px 24px -8px rgba(40,28,12,.5),0 0 0 1px rgba(255,255,255,.12) inset;transition:background-color .2s,transform .15s}',
    '.sp-chat-fab:hover{background:#574428}',
    '.sp-chat-fab:active{transform:scale(.97)}',
    '.sp-chat-fab svg{width:18px;height:18px;display:block}',
    '.sp-chat-badge{position:absolute;top:6px;right:8px;width:10px;height:10px;border-radius:50%;background:#e5484d;box-shadow:0 0 0 2px #fff}',
    '.sp-chat-badge[hidden]{display:none}',
    '.sp-chat-panel{position:absolute;right:0;bottom:0;display:flex;flex-direction:column;overflow:hidden;width:min(360px,calc(100vw - 28px));height:min(70vh,560px);border:1px solid #e3dccf;border-radius:18px;background:#faf8f4;box-shadow:0 40px 90px -34px rgba(48,32,12,.55);opacity:0;pointer-events:none;visibility:hidden;transform:translateY(8px) scale(.96);transform-origin:bottom right;transition:opacity .18s ease,transform .28s cubic-bezier(.2,.8,.2,1),visibility 0s .28s}',
    '.sp-chat-panel.is-open{opacity:1;pointer-events:auto;visibility:visible;transform:none;transition:opacity .18s ease,transform .28s cubic-bezier(.2,.8,.2,1)}',
    '.sp-chat-head{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#2a241c;color:#fff}',
    '.sp-chat-avatar{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#c9b48a;color:#2a241c;font-weight:800;font-size:16px}',
    '.sp-chat-who{min-width:0;flex:1}',
    '.sp-chat-title{font-size:15px;font-weight:700}',
    '.sp-chat-status{margin-top:2px!important;display:flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,255,255,.75)}',
    '.sp-chat-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#34c759;box-shadow:0 0 0 2px rgba(52,199,89,.22)}',
    '.sp-chat-x{flex:none;border:0;background:none;cursor:pointer;padding:6px;border-radius:50%;color:rgba(255,255,255,.8)}',
    '.sp-chat-x:hover{background:rgba(255,255,255,.1);color:#fff}',
    '.sp-chat-x svg{width:20px;height:20px;display:block}',
    '.sp-chat-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}',
    '.sp-row{display:flex;align-items:flex-end;gap:7px;animation:sp-pop .26s cubic-bezier(.2,.8,.2,1) both}',
    '.sp-row.is-in{justify-content:flex-end}',
    '.sp-col{display:flex;flex-direction:column;max-width:78%}',
    '.sp-bubble{padding:8px 13px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}',
    '.sp-in{background:#6b5534;color:#fff;border-radius:16px 16px 5px 16px}',
    '.sp-out{background:#fff;color:#2a241c;border:1px solid #ebe5da;border-radius:16px 16px 16px 5px}',
    '.sp-time{margin-top:3px;font-size:10px;color:#857a6a}',
    '.sp-msg-avatar{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#c9b48a;color:#2a241c;font-weight:800;font-size:12px}',
    '.sp-msg-avatar.is-spacer{visibility:hidden}',
    '.sp-quicks{display:flex;flex-wrap:wrap;gap:7px;padding:2px 0 2px 33px;animation:sp-pop .26s cubic-bezier(.2,.8,.2,1) both}',
    '.sp-quicks button{cursor:pointer;font:inherit;font-size:12.5px;font-weight:600;padding:7px 13px;border-radius:999px;background:#fff;color:#6b5534;border:1px solid #d9cfbd}',
    '.sp-quicks button:hover{background:#6b5534;color:#fff;border-color:#6b5534}',
    '.sp-chat-intro,.sp-chat-send{border-top:1px solid #ebe5da;background:#fff}',
    '.sp-chat-intro{padding:12px 14px;display:flex;flex-direction:column;gap:8px}',
    '.sp-chat-intro[hidden],.sp-chat-send[hidden]{display:none}',
    '.sp-chat-introtext{font-size:12px;line-height:1.5;color:#6f6556}',
    '.sp-chat-intro input,.sp-chat-send textarea{width:100%;font:inherit;font-size:16px;color:#2a241c;padding:9px 12px;border-radius:10px;border:1px solid #d9cfbd;background:#faf8f4;outline:none;margin:0}',
    '.sp-chat-intro input:focus,.sp-chat-send textarea:focus{border-color:#6b5534}',
    '.sp-chat-hint{font-size:11px;line-height:1.45;color:#c0362c}',
    '.sp-chat-hint[hidden]{display:none}',
    '.sp-chat-start{font:inherit;font-size:14px;font-weight:700;cursor:pointer;padding:10px;border:0;border-radius:10px;color:#fff;background:#6b5534}',
    '.sp-chat-start:disabled{opacity:.45;cursor:not-allowed}',
    '.sp-chat-send{display:flex;align-items:flex-end;gap:8px;padding:10px 12px}',
    '.sp-chat-send textarea{max-height:112px;resize:none;line-height:1.45}',
    '.sp-chat-sendbtn{flex:none;border:0;border-radius:12px;cursor:pointer;padding:10px;color:#fff;background:#6b5534}',
    '.sp-chat-sendbtn:disabled{opacity:.5}',
    '.sp-chat-sendbtn svg{width:20px;height:20px;display:block}',
    '@keyframes sp-pop{from{opacity:0;transform:translateY(7px) scale(.98)}to{opacity:1;transform:none}}',
    '@media (max-width:640px){#sp-chat{right:14px;bottom:14px}.sp-chat-fab{padding:11px 15px;font-size:13px}}',
    /* 모바일 레이아웃은 viewport width=320 이라 화면에서 약 1.2배로 커진다 → 조금 줄인다 */
    '@media (max-width:400px){#sp-chat{right:10px;bottom:10px}.sp-chat-panel{width:calc(100vw - 20px);height:min(78vh,520px)}.sp-chat-head{padding:10px 12px;gap:10px}.sp-chat-avatar{width:32px;height:32px;font-size:14px}.sp-chat-title{font-size:14px}.sp-chat-status{font-size:11px}.sp-chat-status span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sp-bubble{font-size:13px;padding:7px 11px}.sp-chat-log{padding:12px 10px}}',
    '@media (prefers-reduced-motion:reduce){.sp-chat-panel,.sp-chat-fab,.sp-row,.sp-quicks{transition:none!important;animation:none!important}}'
  ].join('\n');

  var HTML =
    '<button id="sp-chat-toggle" type="button" class="sp-chat-fab" aria-label="' + S.open + '" aria-expanded="false" aria-controls="sp-chat-panel">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>' +
      '<span>' + S.open + '</span>' +
      '<span id="sp-chat-badge" class="sp-chat-badge" hidden></span>' +
    '</button>' +
    '<section id="sp-chat-panel" class="sp-chat-panel" role="dialog" aria-label="' + S.title + ' ' + S.open + '" aria-hidden="true">' +
      '<header class="sp-chat-head">' +
        '<div class="sp-chat-avatar" aria-hidden="true">S</div>' +
        '<div class="sp-chat-who"><p class="sp-chat-title">' + S.title + '</p>' +
        '<p class="sp-chat-status"><span class="sp-chat-dot"></span><span>' + S.status + '</span></p></div>' +
        '<button id="sp-chat-close" type="button" class="sp-chat-x" aria-label="' + S.close + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
      '</header>' +
      '<div id="sp-chat-log" class="sp-chat-log" aria-live="polite"></div>' +
      '<form id="sp-chat-intro" class="sp-chat-intro">' +
        '<p class="sp-chat-introtext">' + S.intro + '</p>' +
        '<input id="sp-chat-name" type="text" placeholder="' + S.namePh + '" aria-label="' + S.namePh + '" autocomplete="name" required>' +
        '<input id="sp-chat-contact" type="tel" inputmode="tel" placeholder="' + S.contactPh + '" aria-label="전화번호" autocomplete="tel" required>' +
        '<p id="sp-chat-phone-hint" class="sp-chat-hint" hidden>' + S.phoneHint + '</p>' +
        '<button type="submit" class="sp-chat-start" disabled>' + S.start + '</button>' +
      '</form>' +
      '<form id="sp-chat-send" class="sp-chat-send" hidden>' +
        '<textarea id="sp-chat-input" rows="1" placeholder="' + S.inputPh + '" aria-label="' + S.inputPh + '"></textarea>' +
        '<button type="submit" class="sp-chat-sendbtn" aria-label="' + S.send + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 12l16-8-6 16-3-6-7-2Z"/></svg>' +
        '</button>' +
      '</form>' +
    '</section>';

  function init() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    var root = document.createElement('div');
    root.id = 'sp-chat';
    root.innerHTML = HTML;
    document.body.appendChild(root);

    var $ = function (id) { return document.getElementById(id); };
    var toggle = $('sp-chat-toggle'), panel = $('sp-chat-panel'), closeBtn = $('sp-chat-close');
    var badge = $('sp-chat-badge'), log = $('sp-chat-log');
    var introForm = $('sp-chat-intro'), sendForm = $('sp-chat-send');
    var nameInput = $('sp-chat-name'), contactInput = $('sp-chat-contact');
    var phoneHint = $('sp-chat-phone-hint'), textInput = $('sp-chat-input');
    var startBtn = introForm.querySelector('button[type="submit"]');
    var sendBtn = sendForm.querySelector('button');

    function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

    // 전화번호: 숫자만 추려 한국 휴대폰/유선 형식이어야 통과(미완성 번호는 막는다).
    function validPhone(v) {
      var d = (v || '').replace(/\D/g, '');
      return /^(010\d{8}|01[16789]\d{7,8}|0[2-6]\d{7,8})$/.test(d);
    }

    // ---- 방문자 토큰 ----
    var TOKEN_KEY = 'spiral-chat-token';
    var memToken = null;  // 저장소가 막힌 브라우저에서도 한 페이지 안에서는 같은 대화
    function token() {
      var t = store(TOKEN_KEY) || memToken;
      if (!t) {
        var bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        t = 'web_' + btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        memToken = t;
        store(TOKEN_KEY, t);
      }
      return t;
    }

    // ---- 손님 이름·전화번호 ----
    var NAME_KEY = 'spiral-chat-name', CONTACT_KEY = 'spiral-chat-contact';
    var custName = store(NAME_KEY) || '', custContact = store(CONTACT_KEY) || '';
    var hasInfo = !!(custName && custContact);

    // ---- 메시지 렌더 (id 기준 upsert — 상담원이 오타를 고치면 본문만 교체) ----
    var seen = {}, since = '', started = false, poller = null;

    function fmtTime(iso) {
      try { return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }); }
      catch (e) { return ''; }
    }
    function regroupAvatars() {
      var rows = log.querySelectorAll('.sp-row');
      for (var i = 0; i < rows.length; i++) {
        var av = rows[i].querySelector('.sp-msg-avatar');
        if (!av) continue;
        var next = rows[i].nextElementSibling;
        while (next && !next.classList.contains('sp-row')) next = next.nextElementSibling;
        av.classList.toggle('is-spacer', !!(next && !next.classList.contains('is-in')));
      }
    }
    function addBubble(dir, body, iso) {
      var row = document.createElement('div');
      row.className = 'sp-row' + (dir === 'in' ? ' is-in' : '');
      if (dir === 'out') {
        var a = document.createElement('div');
        a.className = 'sp-msg-avatar'; a.setAttribute('aria-hidden', 'true'); a.textContent = 'S';
        row.appendChild(a);
      }
      var col = document.createElement('div'); col.className = 'sp-col';
      var b = document.createElement('div');
      b.className = 'sp-bubble ' + (dir === 'in' ? 'sp-in' : 'sp-out');
      b.textContent = body;
      col.appendChild(b);
      var t = null;
      if (iso) {
        t = document.createElement('div'); t.className = 'sp-time';
        t.style.textAlign = dir === 'in' ? 'right' : 'left';
        t.textContent = fmtTime(iso);
        col.appendChild(t);
      }
      row.appendChild(col);
      log.appendChild(row);
      regroupAvatars();
      return { bubble: b, timeEl: t, body: body };
    }
    function markEdited(entry) {
      if (!entry.timeEl || entry.timeEl.querySelector('.sp-edited')) return;
      var tag = document.createElement('span'); tag.className = 'sp-edited';
      tag.textContent = ' · ' + S.edited;
      entry.timeEl.appendChild(tag);
    }
    function scrollDown() { log.scrollTop = log.scrollHeight; }

    function removeQuicks() { var q = $('sp-quicks'); if (q) q.parentNode.removeChild(q); }
    function greet() {
      addBubble('out', S.greeting);
      var wrap = document.createElement('div');
      wrap.className = 'sp-quicks'; wrap.id = 'sp-quicks';
      S.quicks.forEach(function (label) {
        var btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = label;
        btn.addEventListener('click', function () { doSend(label); });
        wrap.appendChild(btn);
      });
      log.appendChild(wrap);
      regroupAvatars();
    }

    // ---- 폴링 ----
    function poll() {
      var url = API + '/api/webchat/messages?token=' + encodeURIComponent(token()) +
        (since ? '&since=' + encodeURIComponent(since) : '');
      return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
        if (!data || !data.messages) return;
        var added = false, gotReply = false;
        data.messages.forEach(function (m) {
          var known = m.id ? seen[m.id] : null;
          if (known) {
            if (m.body !== known.body) { known.body = m.body; known.bubble.textContent = m.body; markEdited(known); }
            return;
          }
          var entry = addBubble(m.direction, m.body, m.createdAt);
          if (m.id) seen[m.id] = entry;
          if (m.editedAt) markEdited(entry);
          if (m.createdAt && m.createdAt > since) since = m.createdAt;
          added = true;
          if (m.direction === 'out') gotReply = true;
        });
        if (added) scrollDown();
        if (gotReply && !panel.classList.contains('is-open')) badge.hidden = false;
      }).catch(function () {});
    }
    function startPolling() { if (!poller) { poll(); poller = setInterval(poll, 3000); } }
    function stopPolling() { if (poller) { clearInterval(poller); poller = null; } }

    // ---- 열기/닫기 ----
    function open() {
      panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'true');
      badge.hidden = true;
      if (started) startPolling();
      scrollDown();
      setTimeout(function () { (started ? textInput : nameInput).focus(); }, 50);
    }
    function close() {
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      stopPolling();  // 규격: 닫으면 폴링을 멈춘다
    }
    toggle.addEventListener('click', function () { panel.classList.contains('is-open') ? close() : open(); });
    closeBtn.addEventListener('click', function () { close(); toggle.focus(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) { close(); toggle.focus(); }
    });
    // 페이지 안의 '상담 문의' / '레슨 문의하기' 버튼(예전 카카오톡 채널 링크)은 href="#chat" — 이 창을 연다.
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href="#chat"]');
      if (!a) return;
      e.preventDefault();
      open();
    });

    function enterChat() { started = true; introForm.hidden = true; sendForm.hidden = false; }

    function updateStartBtn() {
      var nameOk = (nameInput.value || '').trim().length > 0;
      var phoneOk = validPhone(contactInput.value);
      startBtn.disabled = !(nameOk && phoneOk);
      phoneHint.hidden = !((contactInput.value || '').trim() && !phoneOk);
    }
    nameInput.addEventListener('input', updateStartBtn);
    contactInput.addEventListener('input', updateStartBtn);

    introForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var nm = (nameInput.value || '').trim(), ct = (contactInput.value || '').trim();
      if (!nm || !validPhone(ct)) { updateStartBtn(); return; }
      custName = nm; custContact = ct; hasInfo = true;
      store(NAME_KEY, nm); store(CONTACT_KEY, ct);
      enterChat(); greet();
      if (panel.classList.contains('is-open')) startPolling();
      textInput.focus();
    });

    // ---- 전송 ----
    function doSend(text) {
      text = (text || '').trim();
      if (!text) return;
      if (!hasInfo) { open(); nameInput.focus(); return; }
      removeQuicks();
      if (!started) enterChat();
      sendBtn.disabled = true;
      fetch(API + '/api/webchat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token(), text: text, name: custName, contact: custContact,
          page: location.pathname, site: 'spiral'
        })
      }).then(function (r) {
        if (!r.ok) throw new Error('send failed');
        startPolling(); poll();  // 방금 보낸 것도 바로 보이게
      }).catch(function () {
        var err = document.createElement('div');
        err.className = 'sp-time'; err.style.textAlign = 'center'; err.textContent = S.error;
        log.appendChild(err); scrollDown();
      }).then(function () { sendBtn.disabled = false; });
    }
    sendForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = (textInput.value || '').trim();
      if (!text) return;
      textInput.value = ''; textInput.style.height = 'auto';
      doSend(text);
    });
    // Enter=전송, Shift+Enter=줄바꿈(한글 조합 중 Enter는 무시), 입력창 자동 높이
    textInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (sendForm.requestSubmit) sendForm.requestSubmit(); else sendForm.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
    textInput.addEventListener('input', function () {
      textInput.style.height = 'auto';
      textInput.style.height = Math.min(textInput.scrollHeight, 112) + 'px';
    });

    updateStartBtn();
    if (hasInfo) { enterChat(); greet(); }  // 이미 성함·전화를 남긴 방문자는 대화로 복원
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
