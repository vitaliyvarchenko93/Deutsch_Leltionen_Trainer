    let activeWords = []; 
    let currentMode = 'learn'; 
    let currentFilter = 'all';
    let currentItem = null;
    let isShowingAnswer = false; 

    let learnQueue = [];
    let testQueue = [];
    let currentWordIndex = 0;
    let sessionStarsCount = 0;


    const cardBlock = document.getElementById('card-block');
    const cardMainContent = document.getElementById('card-main-content');
    const cardResultsContent = document.getElementById('card-results-content');
    
    const listBlock = document.getElementById('list-block');
    const tableBody = document.getElementById('words-table-body');
    const counterEl = document.getElementById('word-counter');
    const starsBlock = document.getElementById('stars-block');

    const ruWordEl = document.getElementById('russian-word');
    const wordHintEl = document.getElementById('word-hint');
    const actionBtn = document.getElementById('action-btn');
    const prevBtn = document.getElementById('prev-btn');
    const feedbackEl = document.getElementById('feedback-msg');
    
    const learnBlock = document.getElementById('learn-block');
    const learnAnswerText = document.getElementById('learn-answer-text');
    const contextBtn = document.getElementById('context-btn');
    const contextDisplay = document.getElementById('context-display');
    const contextTextDe = document.getElementById('context-text-de');
    const contextTextRu = document.getElementById('context-text-ru');
    
    const testBlock = document.getElementById('test-block');
    const input1 = document.getElementById('german-input-1');
    const input2 = document.getElementById('german-input-2');
    const labelInput1 = document.getElementById('label-input-1');
    const perfektGroup = document.getElementById('perfekt-group');
    
    const emptyScreen = document.getElementById('empty-screen');
    const modeSwitcherBox = document.getElementById('mode-switcher-box');
    const filterBox = document.getElementById('filter-switcher-box');

    function shuffle(array) {
        let arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function isPerfektRequired() {
        const selectedLesson = document.getElementById('lesson-select').value;
        const match = selectedLesson.match(/\d+/);
        const lessonNum = match ? parseInt(match[0], 10) : 1;
        const lv = (window.LEVELS || {})[(new URLSearchParams(location.search).get('level') || 'a1').toLowerCase()];
        return lessonNum >= ((lv && lv.perfektFrom) || 11);
    }

    function exampleHTML(item) {
        if (!item || !item.context) return '';
        return `<div class="example-box"><div class="example-label">Пример</div>
                <div class="context-de">${item.context.de}</div>
                <div class="context-ru">${item.context.ru}</div></div>`;
    }

    function revealBlur(el) {
        el.classList.add('revealed');
    }

    function evaluateAnswer(userInput, targetStr) {
        const normalize = str => str.replace(/[∙.]/g, '').trim().toLowerCase();

        const originalTargets = targetStr.split('/').map(s => s.trim());
        const targetCleanList = originalTargets.map(s => normalize(s));

        const userCleanList = userInput.split('/').map(s => normalize(s)).filter(Boolean);

        if (userCleanList.length === 0) {
            return { isCorrect: false, missingSynonyms: [] };
        }

        const allInputsValid = userCleanList.every(uPart => targetCleanList.includes(uPart));

        if (!allInputsValid) {
            return { isCorrect: false, missingSynonyms: [] };
        }

        const matchedIndices = userCleanList.map(uPart => targetCleanList.indexOf(uPart));
        const missingSynonyms = originalTargets.filter((_, idx) => !matchedIndices.includes(idx));

        return {
            isCorrect: true,
            missingSynonyms: missingSynonyms
        };
    }

    // Ключ урока в данных может быть «Урок 3» или «Lektion 3: Название» — ищем по номеру
    function parseLessonKey(key) {
        const m = String(key).match(/^\s*(?:Урок|Lektion)\s*(\d+)\s*[:.\-–]?\s*(.*)$/i);
        return m ? { num: parseInt(m[1], 10), title: m[2].trim() } : null;
    }
    function findLesson(num) {
        for (const key of Object.keys(dictionary)) {
            const p = parseLessonKey(key);
            if (p && p.num === num) return { key, title: p.title, words: dictionary[key] };
        }
        return null;
    }

    function initLessonData() {
        if (typeof dictionary === 'undefined') {
            document.getElementById('error-screen').style.display = 'block';
            cardBlock.style.display = 'none';
            modeSwitcherBox.style.display = 'none';
            document.getElementById('lesson-box').style.display = 'none';
            emptyScreen.style.display = 'none';
            return false;
        }

        const selectedLesson = document.getElementById('lesson-select').value;
        const found0 = findLesson(parseInt((selectedLesson.match(/\d+/) || [1])[0], 10));
        const rawList = found0 ? found0.words : [];

        if (rawList.length === 0) {
            const found = Object.keys(dictionary).filter(k => dictionary[k].length).map(k => `${(parseLessonKey(k) || {}).num || k} (${dictionary[k].length})`);
            emptyScreen.innerHTML = 'Слова еще не внесены ❌' +
                `<div style="font-size:13px;margin-top:10px;color:#6c757d">В файле данных есть уроки: ${found.join(', ') || 'ни одного'} (в скобках — число слов)</div>`;
            emptyScreen.style.display = 'block';
            cardBlock.style.display = 'none';
            listBlock.style.display = 'none';
            modeSwitcherBox.style.display = 'none';
            return false;
        } else {
            emptyScreen.style.display = 'none';
            modeSwitcherBox.style.display = 'flex';
            if (currentMode === 'list') {
                listBlock.style.display = 'block';
                cardBlock.style.display = 'none';
            } else {
                cardBlock.style.display = 'flex';
                listBlock.style.display = 'none';
            }
        }

        activeWords = JSON.parse(JSON.stringify(rawList));
        activeWords.forEach(item => {
            if (item.persistentStars === undefined) item.persistentStars = 0;
        });

        learnQueue = shuffle(activeWords);
        testQueue = shuffle(activeWords);
        return true;
    }

    function changeLesson() {
        if (!initLessonData()) return;
        currentWordIndex = 0;
        sessionStarsCount = 0;
        starsBlock.innerText = `0 ★`;
        
        if (currentMode === 'list') {
            renderWordList();
        } else {
            nextWord();
        }
    }

    function setMode(mode) {
        currentMode = mode;
        document.getElementById('btn-learn').classList.toggle('active', mode === 'learn');
        document.getElementById('btn-test').classList.toggle('active', mode === 'test');
        document.getElementById('btn-list').classList.toggle('active', mode === 'list');
        
        closeContext();

        cardResultsContent.style.display = 'none';
        cardMainContent.style.display = 'flex';

        if (mode === 'list') {
            cardMainContent.style.display = 'none';
            cardBlock.style.display = 'none';
            listBlock.style.display = 'block';
            starsBlock.style.display = 'none';
            if (filterBox) filterBox.style.display = 'flex';
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            renderWordList();
        } else {
            cardBlock.style.display = 'flex';
            listBlock.style.display = 'none';
            if (filterBox) filterBox.style.display = 'none';
            learnBlock.style.display = mode === 'learn' ? 'block' : 'none';
            testBlock.style.display = mode === 'test' ? 'block' : 'none';
            
            if (mode === 'learn') {
                starsBlock.style.display = 'none';
                prevBtn.style.display = 'block';
                learnQueue = shuffle(activeWords);
            } else {
                starsBlock.style.display = 'block';
                starsBlock.innerText = `${sessionStarsCount} ★`;
                prevBtn.style.display = 'none';
                input1.value = '';
                input2.value = '';
                testQueue = shuffle(activeWords);
            }
            currentWordIndex = 0;
            nextWord();
        }
    }

    function setFilter(filterType) {
        currentFilter = filterType;
        
        document.getElementById('filter-all').classList.toggle('active', filterType === 'all');
        document.getElementById('filter-verb').classList.toggle('active', filterType === 'verb');
        document.getElementById('filter-noun').classList.toggle('active', filterType === 'noun');
        document.getElementById('filter-other').classList.toggle('active', filterType === 'other');
        
        renderWordList();
    }

    function renderWordList() {
        tableBody.innerHTML = '';
        
        const filteredWords = activeWords.filter(item => {
            if (currentFilter === 'all') return true;
            if (currentFilter === 'verb') return item.type === 'verb';
            if (currentFilter === 'noun') return item.type === 'noun';
            if (currentFilter === 'other') return item.type !== 'verb' && item.type !== 'noun';
            return true;
        });

        if (filteredWords.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#6c757d; padding:20px;">В этом уроке нет слов выбранной части речи</td></tr>`;
            return;
        }

        filteredWords.forEach((item, index) => {
            const tr = document.createElement('tr');
            
            let deCellContent = `<div class="list-de-block">${item.de}</div>`;
            if (item.type === 'verb' && item.perfekt) {
                deCellContent += `<div class="list-perfekt">${item.perfekt}</div>`;
            }
            if (item.persistentStars > 0) {
                deCellContent += `<div class="list-stars">${'★'.repeat(item.persistentStars)}</div>`;
            }

            let ruCellContent = `<div style="font-weight: 700; color: #212529;">${item.ru}</div>`;
            if (item.hint) {
                ruCellContent += `<div class="list-hint">(${item.hint})</div>`;
            }

            tr.innerHTML = `
                <td class="col-num">${index + 1}</td>
                <td>${deCellContent}</td>
                <td>${ruCellContent}</td>
            `;
            tableBody.appendChild(tr);
        });
    }

   function playCurrentAudio() {
    if (!currentItem) return;
    let text = currentItem.de.replace(/[∙.]/g, '').replace(/\//g, ',');
    if (currentItem.type === 'verb' && currentItem.perfekt) text += `, ${currentItem.perfekt}`;
    speakGerman(text);
}

// ---- Озвучка системным синтезатором: выбираем лучший немецкий голос ----
const VOICE_KEY = 'germanVoiceName';
let germanVoice = null;

function scoreVoice(v) {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/^de[-_]de$/i.test(v.lang)) s += 30;               // стандартный немецкий (не австрийский/швейцарский)
    if (/natural|neural|premium|enhanced|studio|wavenet/.test(n)) s += 50;
    if (/google/.test(n)) s += 40;                         // «Google Deutsch» звучит естественно
    if (/anna|petra|markus|katja|conrad|amala|vicki|hedda|stefan|marlene/.test(n)) s += 15;
    if (!v.localService) s += 10;
    if (/compact|espeak|robot/.test(n)) s -= 60;           // самые «роботные»
    return s;
}

function pickGermanVoice() {
    if (!('speechSynthesis' in window)) return null;
    const list = window.speechSynthesis.getVoices().filter(v => /^de([-_]|$)/i.test(v.lang));
    if (!list.length) return null;
    const saved = localStorage.getItem(VOICE_KEY);
    return list.find(v => v.name === saved) || list.sort((x, y) => scoreVoice(y) - scoreVoice(x))[0];
}

function refreshVoice() { germanVoice = pickGermanVoice(); }

function showToast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.style.cssText = 'position:fixed;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 24px);' +
            'background:#212529;color:#fff;padding:14px 18px;border-radius:14px;font-size:14px;line-height:1.4;' +
            'z-index:9999;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.25)';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { t.style.display = 'none'; }, 7000);
}

function speakGerman(text) {
    if (!('speechSynthesis' in window)) { showToast('Этот браузер не поддерживает озвучку.'); return; }
    window.speechSynthesis.cancel();
    if (!germanVoice) refreshVoice();
    if (!germanVoice) {
        // Без немецкого голоса система читает немецкий текст русским/английским голосом — это и звучит как робот
        showToast('На этом устройстве нет немецкого голоса. Установите его в настройках: «Синтез речи» → язык «Deutsch».');
        return;
    }
    setTimeout(() => {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = germanVoice;
        u.lang = germanVoice.lang;
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
    }, 100);
}

    function formatGermanHTML(item) {
        let textHtml = '';
        if (item.type === 'verb' && item.perfekt) {
            textHtml = `<div class="infinitiv-line">${item.de}</div><div class="perfekt-line">${item.perfekt}</div>`;
        } else {
            textHtml = `<div class="other-line">${item.de}</div>`;
        }
        
        return `
            <div class="learn-text-wrapper">${textHtml}</div>
            <button class="audio-btn" onclick="playCurrentAudio()" title="Прослушать">🔊</button>
        `;
    }

    function showFinalResults() {
        cardMainContent.style.display = 'none';
        starsBlock.style.display = 'none';
        cardResultsContent.style.display = 'block';
        
        document.getElementById('results-stars-value').innerText = `${sessionStarsCount} ★`;
        
        let percent = Math.round((sessionStarsCount / activeWords.length) * 100);
        let comment = "Хороший результат! Продолжай в том же духе.";
        if (percent === 100) comment = "Идеально! Ни одной ошибки. Отличная память!";
        else if (percent >= 80) comment = "Прекрасный результат! Ты отлично знаешь эти слова.";
        else if (percent < 50) comment = "Стоит ещё немного повторить слова в режиме Заучивания.";

        document.getElementById('results-feedback-text').innerText = `Ты прошёл весь список слов (${activeWords.length} шт.) и набрал ${sessionStarsCount} звёзд. ${comment}`;
    }

    function restartTestSession() {
        sessionStarsCount = 0;
        activeWords.forEach(item => item.persistentStars = 0); 
        setMode('test'); 
    }

    function prevWord() {
        if (currentMode === 'learn' && currentWordIndex > 0) {
            currentWordIndex--;
            nextWord();
        }
    }

    function nextWord() {
        let currentQueue = (currentMode === 'learn') ? learnQueue : testQueue;
        
        if (currentWordIndex >= currentQueue.length) {
            if (currentMode === 'test') {
                showFinalResults();
                return;
            } else {
                currentWordIndex = 0;
                learnQueue = shuffle(activeWords);
                currentQueue = learnQueue;
            }
        }

        if (currentQueue.length === 0) return;

        currentItem = currentQueue[currentWordIndex];
        counterEl.innerText = `Слово ${currentWordIndex + 1} из ${currentQueue.length}`;
        feedbackEl.innerHTML = '';
        isShowingAnswer = false;
        
        input1.style.borderColor = '#ced4da';
        input2.style.borderColor = '#ced4da';
        
        closeContext();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();

        if (currentMode === 'learn') {
            ruWordEl.innerHTML = currentItem.ru;
            wordHintEl.innerText = currentItem.hint ? `(${currentItem.hint})` : '';
            
            learnAnswerText.innerHTML = formatGermanHTML(currentItem);
            actionBtn.innerText = "Следующее слово";
            
            if (currentItem.context) {
                contextBtn.style.display = 'inline-block';
                contextTextDe.innerText = currentItem.context.de;
                contextTextRu.innerText = currentItem.context.ru;
            } else {
                contextBtn.style.display = 'none';
            }
        } else {
            contextBtn.style.display = 'none';
            ruWordEl.innerHTML = currentItem.ru;
            
            let hintParts = [];
            if (currentItem.hint) {
                hintParts.push(`<span class="blur-hint" onclick="revealBlur(this)" title="Нажмите, чтобы открыть подсказку">(${currentItem.hint})</span>`);
            }
            if (currentItem.type === 'verb' && currentItem.perfekt && !isPerfektRequired()) {
                hintParts.push(`<span class="blur-hint" onclick="revealBlur(this)" title="Нажмите, чтобы открыть подсказку">[Perfekt: ${currentItem.perfekt}]</span>`);
            }
            wordHintEl.innerHTML = hintParts.join(' ');
            
            input1.value = '';
            input2.value = '';
            
            const checkPerfekt = (currentItem.type === 'verb' && currentItem.perfekt && isPerfektRequired());
            
            if (currentItem.type === 'verb') {
                labelInput1.innerText = "Инфинитив глагола";
            } else {
                labelInput1.innerText = "Перевод на немецкий";
            }
            
            if (checkPerfekt) {
                perfektGroup.style.display = "block";
            } else {
                perfektGroup.style.display = "none";
            }
            
            actionBtn.innerText = "Проверить";
            input1.focus();
        }
    }

    function toggleContext() {
        if (currentMode !== 'learn' || !currentItem) return;
        if (contextDisplay.style.display === 'block') {
            closeContext();
        } else {
            contextDisplay.style.display = 'block';
            contextBtn.innerHTML = 'Контекст ▲';
        }
    }

    function closeContext() {
        contextDisplay.style.display = 'none';
        contextBtn.innerHTML = 'Контекст ▼';
    }

    function handleAction() {
        if (currentMode === 'learn') {
            currentWordIndex++;
            nextWord();
        } else {
            if (isShowingAnswer) {
                currentWordIndex++;
                nextWord();
                return;
            }

            const rawVal1 = input1.value.trim();
            const checkPerfekt = (currentItem.type === 'verb' && currentItem.perfekt && isPerfektRequired());

            let rawVal2 = '';
            if (checkPerfekt) {
                rawVal2 = input2.value.trim();
            }

            input1.style.borderColor = '#ced4da';
            input2.style.borderColor = '#ced4da';

            if (checkPerfekt) {
                if (rawVal1 === '' && rawVal2 === '') {
                    input1.style.borderColor = '#fd7e14';
                    input2.style.borderColor = '#fd7e14';
                    feedbackEl.innerHTML = '<span class="warning">Введите Infinitiv и Partizip II! ✍️</span>';
                    return;
                } else if (rawVal1 === '') {
                    input1.style.borderColor = '#fd7e14';
                    feedbackEl.innerHTML = '<span class="warning">Введите Infinitiv! ✍️</span>';
                    return;
                } else if (rawVal2 === '') {
                    input2.style.borderColor = '#fd7e14';
                    feedbackEl.innerHTML = '<span class="warning">Введите Partizip II! ✍️</span>';
                    return;
                }
            } else {
                if (rawVal1 === '') {
                    input1.style.borderColor = '#fd7e14';
                    feedbackEl.innerHTML = '<span class="warning">Введите перевод! ✍️</span>';
                    return;
                }
            }

            const eval1 = evaluateAnswer(rawVal1, currentItem.de);
            let isCorrect = eval1.isCorrect;
            let isPerfektCorrect = true;

            if (checkPerfekt) {
                const eval2 = evaluateAnswer(rawVal2, currentItem.perfekt);
                if (!eval2.isCorrect) {
                    isCorrect = false;
                    isPerfektCorrect = false;
                }
            }

            if (isCorrect) {
                input1.style.borderColor = '#198754';
                if (checkPerfekt) {
                    input2.style.borderColor = '#198754';
                }

                sessionStarsCount += 1;
                starsBlock.innerText = `${sessionStarsCount} ★`;
                
                const origItem = activeWords.find(w => w.de === currentItem.de && w.ru === currentItem.ru);
                if (origItem) origItem.persistentStars += 1;

                let synonymNote = '';
                if (eval1.missingSynonyms.length > 0) {
                    synonymNote = `<div style="font-size: 14px; color: #495057; font-weight: 600; margin-top: 4px;">А также существует синоним: <b>${eval1.missingSynonyms.join(' / ')}</b></div>`;
                }

                feedbackEl.innerHTML = `
                    <div class="feedback-status-line">
                        <span class="correct">Правильно! 👍</span> 
                        <button class="audio-btn" onclick="playCurrentAudio()" title="Прослушать">🔊</button>
                    </div>
                    ${synonymNote}
                    ${exampleHTML(currentItem)}
                `;
                actionBtn.innerText = "Следующее слово";
                isShowingAnswer = true;

                setTimeout(() => { 
                    if (isShowingAnswer) {
                        currentWordIndex++;
                        nextWord();
                    } 
                }, currentItem.context ? 6000 : (synonymNote ? 3000 : 2000));
            } else {
                if (!eval1.isCorrect) {
                    input1.style.borderColor = '#dc3545';
                }
                if (checkPerfekt && !isPerfektCorrect) {
                    input2.style.borderColor = '#dc3545';
                }

                let rightVariant = `<b>${currentItem.de}</b>`;
                if (checkPerfekt) {
                    rightVariant += ` [Perfekt: <b>${currentItem.perfekt}</b>]`;
                }
                
                feedbackEl.innerHTML = `
                    <div class="feedback-status-line">
                        <span class="wrong">Ошибка! ❌</span> 
                        <button class="audio-btn" onclick="playCurrentAudio()" title="Прослушать">🔊</button>
                    </div>
                    <div class="hint">Правильно: ${rightVariant}</div>
                    ${exampleHTML(currentItem)}
                `;
                actionBtn.innerText = "Продолжить";
                isShowingAnswer = true;
            }
        }
    }

    function setupEnterKey(inputElement) {
        inputElement.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleAction();
            }
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault(); 
            toggleContext();
        }
    });

    setupEnterKey(input1);
    setupEnterKey(input2);

    // Голоса в браузерах подгружаются асинхронно
    if ('speechSynthesis' in window) {
        refreshVoice();
        window.speechSynthesis.onvoiceschanged = refreshVoice;
    }

// ---- Инициализация: уровень берётся из ?level=, данные подгружаются из data/<level>.js ----
(function () {
    const params = new URLSearchParams(location.search);
    const levelId = (params.get('level') || 'a1').toLowerCase();
    const level = window.LEVELS[levelId];
    if (!level || level.soon) { location.replace('index.html'); return; }

    document.title = `Lektionen Trainer ${level.name}`;
    document.getElementById('level-badge').textContent = level.name;

    const select = document.getElementById('lesson-select');
    const lessonNum = params.get('lektion');
    const overlay = document.getElementById('lesson-selector-overlay');

    function start() {
        // Названия уроков: из файла данных (если есть), иначе из levels.js
        let total = level.lessons.length;
        if (typeof dictionary !== 'undefined') {
            Object.keys(dictionary).forEach(k => { const p = parseLessonKey(k); if (p) total = Math.max(total, p.num); });
        }
        const titles = [];
        for (let n = 1; n <= total; n++) {
            const f = (typeof dictionary !== 'undefined') ? findLesson(n) : null;
            titles.push((f && f.title) || level.lessons[n - 1] || '');
        }
        select.innerHTML = '';
        titles.forEach((title, i) => {
            const opt = document.createElement('option');
            opt.value = `Урок ${i + 1}`;
            opt.textContent = `Lektion ${i + 1}${title ? ': ' + title : ''}`;
            select.appendChild(opt);
        });
        document.getElementById('selector-title').textContent = `${level.name}: выберите урок (1–${total})`;

        if (lessonNum && select.querySelector(`option[value="Урок ${lessonNum}"]`)) {
            overlay.style.display = 'none';
            select.value = `Урок ${lessonNum}`;
            if (initLessonData()) setMode('learn');
        } else {
            const grid = document.getElementById('lessonsGridContainer');
            titles.forEach((_, i) => {
                const a = document.createElement('a');
                a.className = 'lesson-btn-item';
                a.textContent = i + 1;
                a.href = `trainer.html?level=${levelId}&lektion=${i + 1}`;
                grid.appendChild(a);
            });
        }
    }

    // Данные уровня подгружаем только нужные, а не все сразу
    const s = document.createElement('script');
    s.src = `data/${levelId}.js`;
    s.onload = start;
    s.onerror = () => { overlay.style.display = 'none'; start(); };
    document.head.appendChild(s);
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
