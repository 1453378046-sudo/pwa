(() => {
  const STORAGE_KEYS = {
    todoSchedules: 'todoSchedules',
    timetable: 'selfSystemTimetable'
  };

  function safeJsonParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  function loadArray(key) {
    const raw = localStorage.getItem(key);
    const data = safeJsonParse(raw || '[]', []);
    return Array.isArray(data) ? data : [];
  }

  function saveArray(key, value) {
    localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = String(v);
      else if (k === 'text') node.textContent = String(v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else if (v !== false && v != null) node.setAttribute(k, String(v));
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function formatDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function normalizePath(pathname) {
    return pathname.replace(/\/+$/, '');
  }

  function getRoute() {
    const path = normalizePath(window.location.pathname);
    if (path.endsWith('/panel')) return 'panel';
    if (path.endsWith('/calendar')) return 'calendar';
    return 'root';
  }

  function getTab() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('tab') || 'todo').toLowerCase();
  }

  function renderRoot(container) {
    container.replaceChildren(
      el('div', { class: 'card' }, [
        el('h1', { text: 'Todo Calendar PWA' }),
        el('p', { class: 'muted', text: '请选择入口：' }),
        el('div', { class: 'row' }, [
          el('a', { class: 'btn', href: 'panel?tab=todo' }, ['打开 /panel']),
          el('a', { class: 'btn', href: 'calendar' }, ['打开 /calendar'])
        ])
      ])
    );
  }

  function renderPanel(container) {
    const tab = getTab();
    const schedules = loadArray(STORAGE_KEYS.todoSchedules);
    const today = formatDate(new Date());
    const todayTodos = schedules.filter((t) => t && t.date === today && !t.done);
    const upcomingTodos = schedules
      .filter((t) => t && !t.done)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      .slice(0, 8);

    const header = el('div', { class: 'card' }, [
      el('h1', { text: '面板 /panel' }),
      el('p', { class: 'muted', text: `tab=${tab}` })
    ]);

    if (tab !== 'todo') {
      container.replaceChildren(
        header,
        el('div', { class: 'card' }, [
          el('p', { text: '当前仅提供 todo 面板。' }),
          el('a', { class: 'btn', href: 'panel?tab=todo' }, ['切换到 todo'])
        ])
      );
      return;
    }

    const todoCard = el('div', { class: 'card' }, [
      el('h2', { text: 'Todo' }),
      el('div', { class: 'stats' }, [
        el('div', { class: 'stat' }, [el('div', { class: 'statNum', text: String(todayTodos.length) }), el('div', { class: 'statLabel', text: '今日待办' })]),
        el('div', { class: 'stat' }, [el('div', { class: 'statNum', text: String(schedules.filter((t) => t && !t.done).length) }), el('div', { class: 'statLabel', text: '未完成' })])
      ]),
      el('div', { class: 'list' }, [
        ...upcomingTodos.map((t) =>
          el('div', { class: 'listItem' }, [
            el('div', { class: 'listTitle', text: String(t.title || '未命名') }),
            el('div', { class: 'listMeta', text: String(t.date || '') })
          ])
        ),
        upcomingTodos.length ? null : el('div', { class: 'muted', text: '暂无未完成待办' })
      ]),
      el('div', { class: 'row' }, [
        el('a', { class: 'btn', href: '../calendar' }, ['去日历添加待办'])
      ])
    ]);

    container.replaceChildren(header, todoCard);
  }

  function renderCalendar(container) {
    const schedules = loadArray(STORAGE_KEYS.todoSchedules);
    const timetable = loadArray(STORAGE_KEYS.timetable);

    function rerender() {
      renderCalendar(container);
    }

    function addTodo(form) {
      const title = String(form.querySelector('[name="title"]').value || '').trim();
      const date = String(form.querySelector('[name="date"]').value || '').trim();
      if (!title || !date) return;
      const next = [
        {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          title,
          date,
          done: false,
          createdAt: Date.now()
        },
        ...schedules
      ];
      saveArray(STORAGE_KEYS.todoSchedules, next);
      rerender();
    }

    function toggleDone(id) {
      const next = schedules.map((t) => (t && t.id === id ? { ...t, done: !t.done } : t));
      saveArray(STORAGE_KEYS.todoSchedules, next);
      rerender();
    }

    function removeTodo(id) {
      const next = schedules.filter((t) => t && t.id !== id);
      saveArray(STORAGE_KEYS.todoSchedules, next);
      rerender();
    }

    function addTimetable(form) {
      const title = String(form.querySelector('[name="course"]').value || '').trim();
      const day = String(form.querySelector('[name="day"]').value || '').trim();
      const time = String(form.querySelector('[name="time"]').value || '').trim();
      if (!title || !day || !time) return;
      const next = [
        ...timetable,
        {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          title,
          day,
          time,
          createdAt: Date.now()
        }
      ];
      saveArray(STORAGE_KEYS.timetable, next);
      rerender();
    }

    const today = formatDate(new Date());
    const list = schedules
      .filter((t) => t && t.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const todoList = el('div', { class: 'card' }, [
      el('h1', { text: '日历 /calendar' }),
      el('p', { class: 'muted', text: `localStorage.${STORAGE_KEYS.todoSchedules} 将被写入` }),
      el('form', {
        class: 'form',
        onsubmit: (e) => {
          e.preventDefault();
          addTodo(e.currentTarget);
        }
      }, [
        el('input', { name: 'title', placeholder: '待办标题', autocomplete: 'off' }),
        el('input', { name: 'date', type: 'date', value: today }),
        el('button', { class: 'btn', type: 'submit' }, ['新增待办'])
      ]),
      el('div', { class: 'list' }, [
        ...list.map((t) =>
          el('div', { class: `listItem ${t.done ? 'done' : ''}` }, [
            el('label', { class: 'check' }, [
              el('input', {
                type: 'checkbox',
                checked: !!t.done,
                onchange: () => toggleDone(t.id)
              }),
              el('span', { class: 'listTitle', text: String(t.title || '未命名') })
            ]),
            el('div', { class: 'listMeta', text: String(t.date || '') }),
            el('button', { class: 'link', type: 'button', onclick: () => removeTodo(t.id) }, ['删除'])
          ])
        ),
        list.length ? null : el('div', { class: 'muted', text: '暂无待办，先新增几条用于 Scriptable 验收。' })
      ])
    ]);

    const timetableCard = el('div', { class: 'card' }, [
      el('h2', { text: '课程表（可选）' }),
      el('p', { class: 'muted', text: `写入 localStorage.${STORAGE_KEYS.timetable}` }),
      el('form', {
        class: 'form',
        onsubmit: (e) => {
          e.preventDefault();
          addTimetable(e.currentTarget);
        }
      }, [
        el('input', { name: 'course', placeholder: '课程名称', autocomplete: 'off' }),
        el('select', { name: 'day' }, [
          ...['一', '二', '三', '四', '五', '六', '日'].map((d) => el('option', { value: d, text: `周${d}` }))
        ]),
        el('input', { name: 'time', placeholder: '时间，如 08:30-10:00', autocomplete: 'off' }),
        el('button', { class: 'btn', type: 'submit' }, ['添加课程'])
      ]),
      el('div', { class: 'list' }, [
        ...timetable
          .slice()
          .sort((a, b) => String(a.day || '').localeCompare(String(b.day || '')) || String(a.time || '').localeCompare(String(b.time || '')))
          .map((c) =>
            el('div', { class: 'listItem' }, [
              el('div', { class: 'listTitle', text: String(c.title || '') }),
              el('div', { class: 'listMeta', text: `周${c.day || ''} ${c.time || ''}` })
            ])
          ),
        timetable.length ? null : el('div', { class: 'muted', text: '暂无课程' })
      ])
    ]);

    container.replaceChildren(todoList, timetableCard);
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const scriptEl = document.querySelector('script[src$="app.js"],script[src$="app.js?v=1"],script[src*="app.js?"]');
      const scriptUrl = scriptEl ? new URL(scriptEl.src, window.location.href) : new URL('app.js', window.location.href);
      const swUrl = new URL('sw.js', scriptUrl);
      const scope = swUrl.pathname.replace(/\/sw\.js$/, '/');
      await navigator.serviceWorker.register(swUrl.toString(), { scope });
    } catch {
    }
  }

  function boot() {
    const mount = document.getElementById('app');
    if (!mount) return;

    const route = getRoute();
    if (route === 'panel') renderPanel(mount);
    else if (route === 'calendar') renderCalendar(mount);
    else renderRoot(mount);

    registerServiceWorker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
