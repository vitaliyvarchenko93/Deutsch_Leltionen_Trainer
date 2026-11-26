(function () {
    'use strict';

    const LEVELS = window.LEVELS || {};
    const LEVEL_IDS = Object.keys(LEVELS).filter(id => !LEVELS[id].soon);
    const SET_KEY = 'cards_settings_v1';
    const $ = id => document.getElementById(id);

    function load(key, def) {
        try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; }
        catch (e) { return def; }
    }

    let settings = Object.assign({ cat: 'verb', levels: LEVEL_IDS.slice(), lesson: 0 }, load(SET_KEY, {}));
    if (!['verb', 'noun', 'other', 'all'].includes(settings.cat)) settings.cat = 'verb';
    settings.levels = (settings.levels || []).filter(id => LEVEL_IDS.includes(id));
    settings.lesson = parseInt(settings.lesson, 10) || 0;
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
    const cache = {};

    // Способ 1: обычный fetch (работает на сервере и на GitHub Pages)
    function fetchDict(id) {
        return fetch(`data/${id}.js`)
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then(text => new Function(text + '\n;return (typeof dictionary !== "undefined") ? dictionary : null;')())
            .then(d => { if (!d) throw new Error('no dictionary'); return d; });
    }

    // Способ 2: запасной, для открытия файла прямо с диска (file://)
    function iframeDict(id) {
        return new Promise((resolve, reject) => {
            const f = document.createElement('iframe');
            f.style.display = 'none';
            const token = 'dict_' + id + '_' + Date.now();
            const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 8000);
            function cleanup() {
                clearTimeout(timer);
                window.removeEventListener('message', onMsg);
                f.remove();
            }
            function onMsg(e) {
                if (!e.data || e.data.token !== token) return;
                cleanup();
                if (e.data.dict) resolve(e.data.dict); else reject(new Error('no dictionary'));
            }
            window.addEventListener('message', onMsg);
            f.srcdoc = '<script src="data/' + id + '.js"><\/script>' +
                '<script>parent.postMessage({token:' + JSON.stringify(token) +
                ',dict:(typeof dictionary!=="undefined"?dictionary:null)},"*");<\/script>';
            document.body.appendChild(f);
        });
    }

    function getDict(id) {
        return fetchDict(id).catch(() => iframeDict(id));
    }

    function typeOf(w) {
        return (w.type === 'verb' || w.type === 'noun') ? w.type : 'other';
    }

    // Название урока: из ключа данных («Lektion 3: Название»), иначе из levels.js
    function lessonTitle(id, key, num) {
        const m = String(key).match(/^\s*(?:Урок|Lektion)\s*\d+\s*[:.\-–]\s*(.+)$/i);
        if (m) return m[1].trim();
        return (LEVELS[id].lessons && LEVELS[id].lessons[num - 1]) || '';
    }

    function loadLevel(id) {
        if (cache[id]) return cache[id];
        const p = getDict(id).then(dict => {
            const out = [];
            Object.keys(dict).forEach(k => {
                const m = String(k).match(/(\d+)/);
                const lesson = m ? parseInt(m[1], 10) : 0;
                const title = lessonTitle(id, k, lesson);
                (dict[k] || []).forEach(w => {
                    if (!w || !w.de || !w.ru) return;
                    out.push({
                        key: w.de + '|' + w.ru,
                        type: typeOf(w),
                        de: w.de, ru: w.ru,
                        perfekt: w.perfekt || '', hint: w.hint || '',
                        context: w.context || null,
                        level: LEVELS[id].name, lesson: lesson, lessonTitle: title
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
        const onlyLesson = (ids.length === 1 && settings.lesson) ? settings.lesson : 0;
        const seen = new Set(), pool = [];
        lists.forEach(list => list.forEach(w => {
            if (onlyLesson && w.lesson !== onlyLesson) return;
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
                settings.lesson = 0;                 // при смене уровней урок сбрасываем
                saveSettings(); renderChips(); updateInfo();
            };
            box.appendChild(b);
        });
    }

    // Список уроков: доступен, когда выбран ровно один уровень
    async function refreshLessons() {
        const sel = $('lesson-select');
        sel.innerHTML = '';
        if (settings.levels.length !== 1) {
            const o = document.createElement('option');
            o.value = 0;
            o.textContent = settings.levels.length ? 'Все уроки (выберите один уровень)' : 'Выберите уровень';
            sel.appendChild(o);
            sel.disabled = true;
            settings.lesson = 0;
            return;
        }
        const id = settings.levels[0];
        const words = await loadLevel(id);
        if (settings.levels.length !== 1 || settings.levels[0] !== id) return;   // выбор уже сменился

        const lessons = new Map();
        words.forEach(w => { if (w.lesson && !lessons.has(w.lesson)) lessons.set(w.lesson, w.lessonTitle); });

        const all = document.createElement('option');
        all.value = 0; all.textContent = 'Все уроки';
        sel.appendChild(all);
        [...lessons.keys()].sort((a, b) => a - b).forEach(n => {
            const o = document.createElement('option');
            o.value = n;
            const t = lessons.get(n);
            o.textContent = `Lektion ${n}${t ? ': ' + t : ''}`;
            sel.appendChild(o);
        });
        sel.disabled = false;
        if (!lessons.has(settings.lesson)) settings.lesson = 0;
        sel.value = settings.lesson;
    }

    $('cat-select').onchange = e => {
        settings.cat = e.target.value;
        saveSettings();
        updateInfo();
    };
    $('lesson-select').onchange = e => {
        settings.lesson = parseInt(e.target.value, 10) || 0;
        saveSettings();
        updateInfo();
    };

    let infoToken = 0;
    async function updateInfo() {
        const t = ++infoToken, info = $('setup-info'), btn = $('start-btn');
        btn.disabled = true;
        if (!settings.levels.length) {
            info.textContent = 'Выберите хотя бы один уровень.';
            refreshLessons();
            return;
        }
        info.textContent = 'Загрузка слов…';
        try {
            await refreshLessons();
            if (t !== infoToken) return;
            const pool = await buildPool();
            if (t !== infoToken) return;
            info.textContent = pool.length
                ? `Слов в выборке: ${pool.length}`
                : 'В этой выборке нет слов. Попробуйте другую часть речи или урок.';
            btn.disabled = pool.length === 0;
        } catch (e) {
            if (t !== infoToken) return;
            info.textContent = 'Не удалось загрузить данные уровня. Проверьте папку data.';
        }
    }

    // ---------- Сессия ----------
    let deck = [], idx = 0, animating = false;

    async function startSession() {
        let pool;
        try { pool = await buildPool(); } catch (e) { return; }
        if (!pool.length) return;
        deck = shuffle(pool);
        idx = 0;
        show('play');
        render();
    }

    const TYPE_NAMES = { verb: 'глагол', noun: 'существительное', other: 'другое' };
    const inner = $('card-inner'), wrap = $('card-wrap');

    function render() {
        const it = deck[idx];

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

        $('counter').textContent = `${idx + 1} / ${deck.length}`;
        $('progress-bar').style.width = ((idx + 1) / deck.length * 100) + '%';
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }

    function finish() {
        show('done');
        $('done-info').textContent = `Просмотрено карточек: ${deck.length}.`;
    }

    // ---------- Листание (как в TikTok): вверх — следующая, вниз — предыдущая ----------
    function setPos(dy) {
        wrap.style.transform = `translateY(${dy}px)`;
        wrap.style.opacity = 1 - Math.min(0.4, Math.abs(dy) / 600);
    }
    function resetPos(animate) {
        wrap.style.transition = animate ? 'transform .2s ease, opacity .2s ease' : 'none';
        wrap.style.transform = '';
        wrap.style.opacity = 1;
    }

    // dir = 1 → следующая, dir = -1 → предыдущая
    function go(dir) {
        if (animating) return;
        if (dir === -1 && idx === 0) { resetPos(true); return; }   // дальше назад нельзя
        animating = true;
        wrap.style.transition = 'transform .22s ease-in, opacity .22s ease-in';
        wrap.style.transform = `translateY(${-dir * window.innerHeight * 0.9}px)`;
        wrap.style.opacity = 0;
        setTimeout(() => {
            idx += dir;
            if (idx >= deck.length) {                 // колода закончилась
                idx = deck.length - 1;
                resetPos(false);
                animating = false;
                finish();
                return;
            }
            render();
            // новая карточка выезжает с противоположной стороны
            wrap.style.transition = 'none';
            wrap.style.transform = `translateY(${dir * 80}px)`;
            wrap.style.opacity = 0;
            void wrap.offsetWidth;
            wrap.style.transition = 'transform .22s ease-out, opacity .22s ease-out';
            wrap.style.transform = '';
            wrap.style.opacity = 1;
            setTimeout(() => { animating = false; wrap.style.transition = ''; }, 230);
        }, 220);
    }

    function toggleFlip() { inner.classList.toggle('flipped'); }

    let drag = null;
    wrap.addEventListener('pointerdown', e => {
        if (animating || e.target.closest('button')) return;
        drag = { x: e.clientX, y: e.clientY, dy: 0, moved: false, id: e.pointerId };
        try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
        wrap.style.transition = 'none';
    });
    wrap.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) drag.moved = true;
        if (!drag.moved) return;
        // на первой карточке вниз тянется с сопротивлением
        drag.dy = (idx === 0 && dy > 0) ? dy * 0.3 : dy;
        setPos(drag.dy);
    });
    wrap.addEventListener('pointerup', e => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag; drag = null;
        if (!d.moved) {
            if (Math.abs(e.clientX - d.x) < 8 && Math.abs(e.clientY - d.y) < 8) toggleFlip();
            resetPos(false);
            return;
        }
        if (Math.abs(d.dy) > Math.min(90, wrap.offsetHeight * 0.2)) go(d.dy < 0 ? 1 : -1);
        else resetPos(true);
    });
    wrap.addEventListener('pointercancel', () => { drag = null; resetPos(true); });

    $('exit-btn').onclick = () => { show('setup'); updateInfo(); };
    $('start-btn').onclick = startSession;
    $('again-btn').onclick = startSession;
    $('to-setup-btn').onclick = () => { show('setup'); updateInfo(); };

    // Компьютер: стрелки вверх/вниз (или вправо/влево), пробел — перевернуть, колесо мыши — листать
    document.addEventListener('keydown', e => {
        if (screens.play.hidden) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(1); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
        else if (e.key === ' ') { e.preventDefault(); toggleFlip(); }
    });
    let wheelLock = 0;
    document.addEventListener('wheel', e => {
        if (screens.play.hidden || Math.abs(e.deltaY) < 20) return;
        const now = Date.now();
        if (now - wheelLock < 500) return;
        wheelLock = now;
        go(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });

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
        const it = deck[idx];
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