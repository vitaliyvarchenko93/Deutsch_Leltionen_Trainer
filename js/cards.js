(function () {
    'use strict';

    const LEVELS = window.LEVELS || {};
    const LEVEL_IDS = Object.keys(LEVELS).filter(id => !LEVELS[id].soon);
    const KNOWN_KEY = 'cards_known_v1';
    const SET_KEY = 'cards_settings_v1';
    const $ = id => document.getElementById(id);

    function load(key, def) {
        try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; }
        catch (e) { return def; }
    }

    let known = new Set(load(KNOWN_KEY, []));
    const saveKnown = () => localStorage.setItem(KNOWN_KEY, JSON.stringify([...known]));
    let settings = Object.assign({ cat: 'verb', levels: LEVEL_IDS.slice(), hideKnown: false }, load(SET_KEY, {}));
    settings.levels = (settings.levels || []).filter(id => LEVEL_IDS.includes(id));
    const saveSettings = () => localStorage.setItem(SET_KEY, JSON.stringify(settings));

    function shuffle(a) {
        const arr = a.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ---------- Загрузка слов ----------
    // Каждый data/*.js объявляет const dictionary, поэтому выполняем их по одному в изолированной функции
    const cache = {};
    function loadLevel(id) {
        if (cache[id]) return cache[id];
        const p = fetch(`data/${id}.js`)
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then(text => {
                const dict = new Function(text + '\n;return (typeof dictionary !== "undefined") ? dictionary : null;')();
                if (!dict) throw new Error('no dictionary');
                const out = [];
                Object.keys(dict).forEach(k => {
                    const m = String(k).match(/(\d+)/);
                    const lesson = m ? parseInt(m[1], 10) : 0;
                    (dict[k] || []).forEach(w => {
                        if (!w || !w.de || !w.ru) return;
                        out.push({
                            key: w.de + '|' + w.ru,
                            type: (w.type === 'verb' || w.type === 'noun') ? w.type : 'other',
                            de: w.de, ru: w.ru,
                            perfekt: w.perfekt || '', hint: w.hint || '',
                            context: w.context || null,
                            level: LEVELS[id].name, lesson: lesson
                        });
                    });
                });
                return out;
            });
        cache[id] = p;
        p.catch(() => { delete cache[id]; });
        return p;
    }

    async function buildPool() {
        const ids = LEVEL_IDS.filter(id => settings.levels.includes(id));
        const lists = await Promise.all(ids.map(loadLevel));
        const seen = new Set(), pool = [];
        lists.forEach(list => list.forEach(w => {
            if (seen.has(w.key)) return;
            seen.add(w.key);
            if (settings.cat !== 'all' && w.type !== settings.cat) return;
            pool.push(w);
        }));
        return pool;
    }

    // ---------- Экран настроек ----------
    const screens = { setup: $('setup'), play: $('play'), done: $('done') };
    function show(name) {
        Object.keys(screens).forEach(k => { screens[k].hidden = (k !== name); });
    }

    function renderChips() {
        $('cat-select').value = settings.cat;
        const box = $('lvl-chips');
        box.innerHTML = '';
        LEVEL_IDS.forEach(id => {
            const b = document.createElement('button');
            b.className = 'chip' + (settings.levels.includes(id) ? ' active' : '');
            b.textContent = LEVELS[id].name;
            b.onclick = () => {
                const i = settings.levels.indexOf(id);
                if (i >= 0) settings.levels.splice(i, 1); else settings.levels.push(id);
                saveSettings(); renderChips(); updateInfo();
            };
            box.appendChild(b);
        });
        $('hide-known').checked = !!settings.hideKnown;
    }

    $('cat-select').onchange = e => {
        settings.cat = e.target.value;
        saveSettings();
        updateInfo();
    };
    $('hide-known').onchange = e => { settings.hideKnown = e.target.checked; saveSettings(); updateInfo(); };
    $('reset-btn').onclick = () => {
        if (confirm('Сбросить отметки «выучено» для всех слов?')) {
            known = new Set(); saveKnown(); updateInfo();
        }
    };

    let infoToken = 0;
    async function updateInfo() {
        const t = ++infoToken, info = $('setup-info'), btn = $('start-btn');
        btn.disabled = true;
        if (!settings.levels.length) { info.textContent = 'Выберите хотя бы один уровень.'; return; }
        info.textContent = 'Загрузка слов…';
        try {
            const pool = await buildPool();
            if (t !== infoToken) return;
            const k = pool.filter(w => known.has(w.key)).length;
            const avail = settings.hideKnown ? pool.length - k : pool.length;
            info.textContent = `Слов в выборке: ${pool.length} · выучено: ${k}` + (avail === 0 ? ' · повторять нечего' : '');
            btn.disabled = avail === 0;
        } catch (e) {
            if (t !== infoToken) return;
            info.textContent = 'Не удалось загрузить данные уровня. Проверьте папку data.';
        }
    }

    // ---------- Сессия ----------
    let queue = [], total = 0, knownCount = 0, againCount = 0, history = [];
    let animating = false;

    async function startSession() {
        let pool;
        try { pool = await buildPool(); } catch (e) { return; }
        const list = settings.hideKnown ? pool.filter(w => !known.has(w.key)) : pool;
        if (!list.length) return;
        queue = shuffle(list);
        total = queue.length; knownCount = 0; againCount = 0; history = [];
        show('play');
        render();
    }

    const TYPE_NAMES = { verb: 'глагол', noun: 'существительное', other: 'другое' };
    const inner = $('card-inner'), wrap = $('card-wrap');
    const stampKnow = $('stamp-know'), stampNo = $('stamp-no');

    function render() {
        if (!queue.length) { finish(); return; }
        const it = queue[0];

        // мгновенно возвращаем карточку лицом, без анимации переворота
        inner.style.transition = 'none';
        inner.classList.remove('flipped');
        void inner.offsetWidth;
        inner.style.transition = '';

        const label = `${it.level}${it.lesson ? ' · урок ' + it.lesson : ''}`;
        $('front-tag').textContent = `${TYPE_NAMES[it.type]} · ${label}`;
        $('front-ru').textContent = it.ru;
        $('front-hint').textContent = it.hint ? `(${it.hint})` : '';

        $('back-tag').textContent = TYPE_NAMES[it.type];
        $('back-de').textContent = it.de;
        $('back-perfekt').textContent = (it.type === 'verb' && it.perfekt) ? it.perfekt : '';
        const ctx = $('back-ctx');
        if (it.context) {
            ctx.hidden = false;
            $('ctx-de').textContent = it.context.de;
            $('ctx-ru').textContent = it.context.ru;
        } else {
            ctx.hidden = true;
        }

        $('counter').textContent = `Осталось: ${queue.length}`;
        $('progress-bar').style.width = (total ? (knownCount / total) * 100 : 0) + '%';
        $('undo-btn').style.visibility = history.length ? 'visible' : 'hidden';
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }

    function answer(dir) {
        const it = queue.shift();
        if (dir === 'know') {
            const was = known.has(it.key);
            known.add(it.key); saveKnown();
            knownCount++;
            history.push({ item: it, dir, was });
        } else {
            againCount++;
            queue.splice(Math.min(queue.length, 6), 0, it);   // вернётся через несколько карточек
            history.push({ item: it, dir });
        }
    }

    function undo() {
        if (animating) return;
        const h = history.pop();
        if (!h) return;
        if (h.dir === 'know') {
            if (!h.was) { known.delete(h.item.key); saveKnown(); }
            knownCount--;
        } else {
            againCount--;
            const i = queue.indexOf(h.item);
            if (i > -1) queue.splice(i, 1);
        }
        queue.unshift(h.item);
        render();
    }

    function finish() {
        show('done');
        $('done-info').textContent =
            `Слов выучено за сессию: ${knownCount}. Повторов («не знаю»): ${againCount}.`;
    }

    // ---------- Жесты ----------
    function setPos(dx) {
        wrap.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
        const p = Math.min(1, Math.abs(dx) / 110);
        stampKnow.style.opacity = dx > 0 ? p : 0;
        stampNo.style.opacity = dx < 0 ? p : 0;
    }
    function resetPos(animate) {
        wrap.style.transition = animate ? 'transform .2s ease' : 'none';
        wrap.style.transform = '';
        wrap.style.opacity = 1;
        stampKnow.style.opacity = 0;
        stampNo.style.opacity = 0;
    }
    function fly(dir) {
        if (animating || !queue.length) return;
        animating = true;
        const sign = dir === 'know' ? 1 : -1;
        stampKnow.style.opacity = dir === 'know' ? 1 : 0;
        stampNo.style.opacity = dir === 'know' ? 0 : 1;
        wrap.style.transition = 'transform .25s ease-in, opacity .25s ease-in';
        wrap.style.transform = `translateX(${sign * window.innerWidth * 1.1}px) rotate(${sign * 25}deg)`;
        wrap.style.opacity = 0;
        setTimeout(() => {
            answer(dir);
            resetPos(false);
            animating = false;
            render();
        }, 240);
    }
    function toggleFlip() { inner.classList.toggle('flipped'); }

    let drag = null;
    wrap.addEventListener('pointerdown', e => {
        if (animating || e.target.closest('button')) return;
        drag = { x: e.clientX, y: e.clientY, dx: 0, moved: false, id: e.pointerId };
        try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
        wrap.style.transition = 'none';
    });
    wrap.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) drag.moved = true;
        if (!drag.moved) return;
        drag.dx = dx;
        setPos(dx);
    });
    wrap.addEventListener('pointerup', e => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag; drag = null;
        if (!d.moved) {
            if (Math.abs(e.clientX - d.x) < 8 && Math.abs(e.clientY - d.y) < 8) toggleFlip();
            resetPos(false);
            return;
        }
        if (Math.abs(d.dx) > Math.min(110, wrap.offsetWidth * 0.3)) fly(d.dx > 0 ? 'know' : 'again');
        else resetPos(true);
    });
    wrap.addEventListener('pointercancel', () => { drag = null; resetPos(true); });

    $('undo-btn').onclick = undo;
    $('exit-btn').onclick = () => { show('setup'); updateInfo(); };
    $('start-btn').onclick = startSession;
    $('again-btn').onclick = startSession;
    $('to-setup-btn').onclick = () => { show('setup'); updateInfo(); };

    // Клавиатура (для компьютера): стрелки влево/вправо и пробел
    document.addEventListener('keydown', e => {
        if (screens.play.hidden) return;
        if (e.key === 'ArrowRight') fly('know');
        else if (e.key === 'ArrowLeft') fly('again');
        else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); toggleFlip(); }
    });

    // ---------- Озвучка (как в тренажёре) ----------
    const VOICE_KEY = 'germanVoiceName';
    let germanVoice = null;
    function scoreVoice(v) {
        const n = v.name.toLowerCase(); let s = 0;
        if (/^de[-_]de$/i.test(v.lang)) s += 30;
        if (/natural|neural|premium|enhanced|studio|wavenet/.test(n)) s += 50;
        if (/google/.test(n)) s += 40;
        if (!v.localService) s += 10;
        if (/compact|espeak|robot/.test(n)) s -= 60;
        return s;
    }
    function refreshVoice() {
        if (!('speechSynthesis' in window)) return;
        const list = window.speechSynthesis.getVoices().filter(v => /^de([-_]|$)/i.test(v.lang));
        const saved = localStorage.getItem(VOICE_KEY);
        germanVoice = list.find(v => v.name === saved) || list.sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
    }
    if ('speechSynthesis' in window) {
        refreshVoice();
        window.speechSynthesis.onvoiceschanged = refreshVoice;
    }
    $('audio-btn').onclick = () => {
        const it = queue[0];
        if (!it || !('speechSynthesis' in window)) return;
        if (!germanVoice) refreshVoice();
        if (!germanVoice) { alert('На устройстве нет немецкого голоса. Установите его в настройках синтеза речи.'); return; }
        let text = it.de.replace(/[∙·.]/g, '').replace(/\//g, ',');
        if (it.type === 'verb' && it.perfekt) text += ', ' + it.perfekt;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = germanVoice; u.lang = germanVoice.lang; u.rate = 0.9;
        window.speechSynthesis.speak(u);
    };

    // ---------- Старт ----------
    renderChips();
    updateInfo();
})();