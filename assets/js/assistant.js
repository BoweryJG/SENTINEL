(() => {
  const API_BASE = window.ASSISTANT_API_BASE || 'https://your-railway-backend.example.com';

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

  function ensureWidget() {
    const widget = qs('#assistant-widget');
    if (widget) return widget;
    const container = document.createElement('div');
    container.id = 'assistant-widget';
    container.className = 'assistant-closed';
    container.innerHTML = `
      <button class="assistant-toggle" aria-label="Open Assistant">Assistant</button>
      <div class="assistant-panel" role="dialog" aria-label="SENTINEL Assistant" aria-modal="false">
        <div class="assistant-header">
          <div class="assistant-title">SENTINEL Assistant</div>
          <button class="assistant-close" aria-label="Close">×</button>
        </div>
        <div class="assistant-body">
          <div class="assistant-messages" aria-live="polite"></div>
          <form class="assistant-input">
            <input name="msg" type="text" placeholder="Type a message…" autocomplete="off" />
            <button type="submit">Send</button>
          </form>
        </div>
      </div>`;
    document.body.appendChild(container);
    return container;
  }

  function addMessage(el, who, text) {
    const wrap = document.createElement('div');
    wrap.className = `assistant-msg ${who}`;
    wrap.textContent = text;
    el.appendChild(wrap);
    el.scrollTop = el.scrollHeight;
  }

  async function sendToAssistant(message, explicitIntent) {
    try {
      const res = await fetch(`${API_BASE}/api/assistant/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, intent: explicitIntent })
      });
      return await res.json();
    } catch (e) {
      return { intent: 'error', prompt: 'Unable to reach assistant service. Please try again later.' };
    }
  }

  async function submitForm(action, data) {
    if (action === 'queue_case' || action === 'create_case') {
      const res = await fetch(`${API_BASE}/api/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    }
    if (action === 'schedule_intro' || action === 'onboard') {
      // For now, just echo; later integrate email/scheduling
      return { ok: true, status: 'received', details: data };
    }
    return { ok: false };
  }

  function renderNextStep(container, next) {
    const box = document.createElement('div');
    box.className = 'assistant-next';

    if (next?.type === 'form') {
      const form = document.createElement('form');
      form.className = 'assistant-dynamic-form';
      next.fields.forEach(f => {
        const row = document.createElement('label');
        row.innerHTML = `<span>${f.label}${f.required ? ' *' : ''}</span>`;
        const input = document.createElement('input');
        input.name = f.id;
        input.required = !!f.required;
        row.appendChild(input);
        form.appendChild(row);
      });
      const btn = document.createElement('button');
      btn.type = 'submit';
      btn.textContent = 'Submit';
      form.appendChild(btn);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const res = await submitForm(next.submit?.action, data);
        addMessage(qs('.assistant-messages', container), 'assistant', 'Received. Our team will follow up shortly.');
        form.remove();
      });
      box.appendChild(form);
    }

    if (Array.isArray(next?.options)) {
      const opts = document.createElement('div');
      opts.className = 'assistant-options';
      next.options.forEach(opt => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = opt.label;
        b.addEventListener('click', async () => {
          const reply = await sendToAssistant('', opt.id);
          addMessage(qs('.assistant-messages', container), 'assistant', reply.prompt);
          if (reply.next) renderNextStep(container, reply.next);
        });
        opts.appendChild(b);
      });
      box.appendChild(opts);
    }

    qs('.assistant-body', container).appendChild(box);
  }

  function init() {
    const widget = ensureWidget();
    const toggle = qs('.assistant-toggle', widget);
    const closeBtn = qs('.assistant-close', widget);
    const panel = qs('.assistant-panel', widget);
    const messages = qs('.assistant-messages', widget);
    const inputForm = qs('.assistant-input', widget);
    const input = qs('input[name="msg"]', inputForm);

    function open() { widget.classList.remove('assistant-closed'); widget.classList.add('assistant-open'); input.focus(); }
    function close() { widget.classList.add('assistant-closed'); widget.classList.remove('assistant-open'); }

    toggle.addEventListener('click', open);
    closeBtn.addEventListener('click', close);

    // Greeting
    addMessage(messages, 'assistant', 'Hi — I can book intros, request RN coverage, onboard your practice, or create a case. What do you need?');

    inputForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      addMessage(messages, 'user', text);
      input.value = '';
      const reply = await sendToAssistant(text);
      addMessage(messages, 'assistant', reply.prompt);
      if (reply.next) renderNextStep(widget, reply.next);
      if (reply.options) renderNextStep(widget, { options: reply.options });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

