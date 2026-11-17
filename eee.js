/*
 * 积木外形实验 / Block Shape Lab  v4
 * ------------------------------------------------------------------
 * 六条积木：
 *   1) a_block —— 普通积木「这是个实验积木」，也是被改外表的目标。
 *   2) 把 a_block 积木的外形改成 [PATH] [MODE] —— 改上面那条积木（按类型 a_block 找）。
 *   3) 把 a_block 积木恢复原样。
 *   4) 把 data-id 为 [ID] 的积木的外形改成 [PATH] [MODE] —— 改成「任意指定 data-id」
 *      的积木，比如 data-id 是 blockShapeLab_a_block、或者任何别的积木的 data-id。
 *   5) 把 data-id 为 [ID] 的积木恢复原样 —— 只恢复这一个。
 *   6) 在 data-id 为 [ID] 的积木上 [ACTION] [TYPE] —— 真·往积木上加/删输入框：
 *        数字输入框（math_number 影子）、文本输入框（text 影子）、
 *        数字填充框（空椭圆插槽）、布尔填充框（空六边形插槽）、下拉框（1/2/3）。
 *      ACTION = 添加 / 删除一个 / 全部删除。
 *
 *   [PATH] 输入框可以放：
 *     · 一整段 <g>...</g>（推荐，整个标签都套用）
 *     · 一个 <path .../>
 *     · 只给 d 属性的内容（m 0,4 A 4,4 ...），也支持 `d="..."` 写法
 *     留空 = 用内置示例（就是你贴的那段）。
 *
 * 定位方式：
 *   按类型：优先用 Blockly 工作区 API 按「积木类型」找（a_block，自动兼容
 *   blockShapeLab_a_block 这种带扩展前缀的写法）；不行再按 data-id 找，
 *   再不行用 vm 里的积木数据，最后按积木上的文字兜底。
 *   按 data-id：精确匹配 g.blocklyDraggable 的 data-id（也兼容直接填积木类型 /
 *   Blockly 的 block.id），多个同 id 的积木会一起改。
 *   调色板里的那份永远跳过。
 *
 * 两种套用模式（MODE）：
 *   · 只套外观 / 保留位置（skin，默认）：复制 class（合并）、data-shapes、
 *     data-category、子节点、path、text，但 **不复制 <g> 上的 transform 和 data-id**。
 *     因为 transform 是 Blockly 自己维护的坐标，复制过来积木会跑到画布外
 *     （比如 translate(12,10224)），data-id 则是 Blockly 认领拖拽手势用的。
 *   · 原样套用 / 含坐标（full）：连 transform 和 data-id 也一起写进去，
 *     完全按你贴的那段来 —— 积木会立刻移动到 transform 指定的位置，
 *     之后还能正常拖动（拖完 Blockly 会自己更新 transform）。
 *
 * 关于自动保持：
 *   Blockly 每次重绘都会把 path 的 d 和文字重新写一遍，所以改完会挂
 *   MutationObserver，一旦发现被改回去就立刻重新套用，外观不会“弹回去”。
 */
(function (Scratch) {
    'use strict';

    // ====== 想改配置就改这里 ======
    const EXTENSION_ID = 'blockShapeLab';
    const TARGET_OPCODE = 'a_block';                        // 目标积木的 opcode
    const TARGET_FULL_ID = EXTENSION_ID + '_' + TARGET_OPCODE; // 扩展里实际使用的类型/ID
    const TARGET_LABEL = '这是个实验积木';                    // 目标积木上的文字（仅最后兜底定位用）

    // 输入框留空时使用的示例
    const SAMPLE_SVG = '<g data-id="blockShapeLab_a_block" class="blocklyDraggable" data-shapes="stack" data-category="积木外形实验" transform="translate(12,10224)"><path class="blocklyPath blocklyBlockBackground" stroke="#cc2944" fill="#FF3355" fill-opacity="1" d="m 0,4 A 4,4 0 0,1 4,0 H 12 c 2,0 3,1 4,2 l 4,4 c 1,1 2,2 4,2 h 12 c 2,0 3,-1 4,-2 l 4,-4 c 1,-1 2,-2 4,-2 H 124 a 4,4 0 0,1 4,4 v 40  a 4,4 0 0,1 -4,4 H 48   c -2,0 -3,1 -4,2 l -4,4 c -1,1 -2,2 -4,2 h -12 c -2,0 -3,-1 -4,-2 l -4,-4 c -1,-1 -2,-2 -4,-2 H 4 a 4,4 0 0,1 -4,-4 z"></path><text class="blocklyText" y="2" text-anchor="middle" dominant-baseline="middle" dy="0" x="56" transform="translate(8, 24) ">这是个实验积木</text></g>';

    // 这些属性在 skin 模式下不写进 <g>（会移动积木 / 影响 Blockly 内部逻辑）
    const G_SKIP_IN_SKIN = ['transform', 'data-id'];

    // ============ 小工具 ============

    function warn(msg) {
        try {
            if (typeof console !== 'undefined' && console.warn) console.warn('[积木外形] ' + msg);
        } catch (e) { /* 忽略 */ }
    }

    function splitClass(value) {
        return String(value || '').split(/\s+/).filter(Boolean);
    }

    function allAttrs(el) {
        const out = {};
        if (!el) return out;
        try {
            if (typeof el.getAttributeNames === 'function') {
                const names = el.getAttributeNames();
                for (let i = 0; i < names.length; i++) out[names[i]] = el.getAttribute(names[i]);
                return out;
            }
        } catch (e) { /* 换一种取法 */ }
        const attrs = el.attributes;
        if (!attrs) return out;
        for (let i = 0; i < attrs.length; i++) {
            const a = attrs[i];
            if (a) out[a.name] = a.value;
        }
        return out;
    }

    // ============ 找工作区 / 目标积木 ============

    function getMainWorkspace() {
        const candidates = [];
        try { candidates.push(window.Blockly); } catch (e) { /* 忽略 */ }
        try { candidates.push(window.ScratchBlocks); } catch (e) { /* 忽略 */ }
        for (let i = 0; i < candidates.length; i++) {
            const B = candidates[i];
            if (!B || typeof B.getMainWorkspace !== 'function') continue;
            try {
                const ws = B.getMainWorkspace();
                if (ws) return ws;
            } catch (e) { /* 换下一个 */ }
        }
        return null;
    }

    // 类型名：a_block / blockShapeLab_a_block / 其它前缀_a_block 都认
    function typeMatches(type) {
        if (typeof type !== 'string' || !type) return false;
        if (type === TARGET_OPCODE || type === TARGET_FULL_ID) return true;
        const suffix = '_' + TARGET_OPCODE;
        return type.length > suffix.length && type.slice(-suffix.length) === suffix;
    }

    // data-id 也做同样的兼容（不同平台有时 data-id 就是类型名）
    function idMatches(id) {
        return typeMatches(id);
    }

    // 调色板（左侧积木栏）里的积木也有同样的 DOM，别改到它们
    function isInPalette(el) {
        try {
            return !!(el.closest && el.closest(
                '.blocklyFlyout, .blocklyToolboxDiv, .blocklyWidgetDiv, .blocklyDropDownDiv'
            ));
        } catch (e) {
            return false;
        }
    }

    function findGroupByBlockId(id) {
        const groups = document.querySelectorAll('g.blocklyDraggable');
        for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            if (g.getAttribute('data-id') === id && !isInPalette(g)) return g;
        }
        return null;
    }

    // 兜底：从 vm 的积木数据里按 opcode 找 id
    function getTargetIdsFromVM() {
        const ids = [];
        try {
            const vm = Scratch.vm;
            const runtime = vm && vm.runtime;
            const target = vm && (vm.editingTarget ||
                (runtime && typeof runtime.getEditingTarget === 'function' ? runtime.getEditingTarget() : null));
            const blocks = target && target.blocks;
            if (!blocks) return ids;
            const store = blocks._blocks ||
                (typeof blocks.getBlockMap === 'function' ? blocks.getBlockMap() : null);
            if (!store) return ids;
            const keys = Object.keys(store);
            for (let i = 0; i < keys.length; i++) {
                const b = store[keys[i]];
                if (b && typeMatches(b.opcode)) ids.push(keys[i]);
            }
        } catch (e) { /* 忽略 */ }
        return ids;
    }

    // 拿到工作区里所有 a_block 积木：{ block, groupEl }
    function pushEntry(entries, seenGroups, block, groupEl) {
        if (!groupEl) return;
        if (seenGroups.indexOf(groupEl) !== -1) return;
        seenGroups.push(groupEl);
        entries.push({ block: block || null, groupEl: groupEl });
    }

    // 按类型（a_block）找目标积木
    function findEntriesByType() {
        const entries = [];
        const seenGroups = [];
        const add = (block, groupEl) => pushEntry(entries, seenGroups, block, groupEl);

        // 1) 正规做法：问 Blockly 要工作区里所有积木，按类型筛
        const ws = getMainWorkspace();
        if (ws && typeof ws.getAllBlocks === 'function') {
            let all = [];
            try { all = ws.getAllBlocks(false) || []; } catch (e) { all = []; }
            for (let i = 0; i < all.length; i++) {
                const b = all[i];
                if (b && typeMatches(b.type) && b.svgGroup_) add(b, b.svgGroup_);
            }
        }
        if (entries.length) return entries;

        // 2) 按 data-id 找 DOM（有些人拿到的 data-id 就是类型名）
        const byId = document.querySelectorAll('g.blocklyDraggable');
        for (let i = 0; i < byId.length; i++) {
            const g = byId[i];
            if (idMatches(g.getAttribute('data-id')) && !isInPalette(g)) add(null, g);
        }
        if (entries.length) return entries;

        // 3) 用 vm 里的积木数据拿到 id，再查 DOM
        const ids = getTargetIdsFromVM();
        for (let i = 0; i < ids.length; i++) {
            const groupEl = findGroupByBlockId(ids[i]);
            if (groupEl) add(null, groupEl);
        }
        if (entries.length) return entries;

        // 4) 最后兜底：按积木上的文字找
        const groups = document.querySelectorAll('g.blocklyDraggable');
        for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            if (isInPalette(g)) continue;
            if ((g.textContent || '').indexOf(TARGET_LABEL) !== -1) add(null, g);
        }
        return entries;
    }

    // 按指定 data-id 找目标积木（也接受直接写积木类型名）
    function findEntriesByDataId(rawId) {
        const id = String(rawId === undefined || rawId === null ? '' : rawId).trim();
        const entries = [];
        const seenGroups = [];
        if (!id) return entries;

        // 1) DOM 里按 data-id 精确匹配（跳过调色板）
        const groups = document.querySelectorAll('g.blocklyDraggable');
        for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            if (g.getAttribute('data-id') !== id) continue;
            if (isInPalette(g)) continue;
            pushEntry(entries, seenGroups, null, g);
        }
        if (entries.length) return entries;

        // 2) 退一步：按 Blockly 里的 block.id / block.type 匹配
        const ws = getMainWorkspace();
        if (ws && typeof ws.getAllBlocks === 'function') {
            let all = [];
            try { all = ws.getAllBlocks(false) || []; } catch (e) { all = []; }
            for (let i = 0; i < all.length; i++) {
                const b = all[i];
                if (!b || !b.svgGroup_) continue;
                if (b.id === id || b.type === id) pushEntry(entries, seenGroups, b, b.svgGroup_);
            }
        }
        return entries;
    }

    // ============ 解析输入 ============

    function parseSvg(source) {
        // 优先 XML 解析（能正确保留 SVG 命名空间）
        try {
            const doc = new DOMParser().parseFromString(
                '<svg xmlns="http://www.w3.org/2000/svg">' + source + '</svg>',
                'image/svg+xml'
            );
            if (doc && !doc.querySelector('parsererror') && doc.documentElement) {
                return doc.documentElement;
            }
        } catch (e) { /* 换 HTML 解析 */ }
        // 再退回 HTML 解析（标签没写成对时也能救回来）
        try {
            const div = document.createElement('div');
            div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + source + '</svg>';
            const svg = div.querySelector('svg');
            if (svg) return svg;
        } catch (e) { /* 放弃 */ }
        return null;
    }

    /*
     * 把输入解析成 { gAttrs, paths, texts, extras }：
     *   gAttrs  <g> 上的属性
     *   paths   [{ attrs }]
     *   texts   [{ attrs, text }]
     *   extras  其它子元素（原样追加到积木里）
     */
    function parseSpec(input) {
        const raw = (input === undefined || input === null) ? '' : String(input).trim();
        const source = raw || SAMPLE_SVG;
        const spec = { gAttrs: {}, paths: [], texts: [], extras: [] };

        // 情况一：直接是 d 属性的内容（没有尖括号）
        if (source.charAt(0) !== '<') {
            const direct = /^d\s*=\s*(["'])([\s\S]*)\1$/i.exec(source);
            spec.paths.push({ attrs: { d: direct ? direct[2] : source } });
            return spec;
        }

        // 情况二：<path .../> 或 <g>...</g>
        const root = parseSvg(source);
        if (!root) return null;

        const g = root.querySelector('g');
        if (g) spec.gAttrs = allAttrs(g);

        const paths = g ? g.querySelectorAll('path') : root.querySelectorAll('path');
        for (let i = 0; i < paths.length; i++) {
            spec.paths.push({ attrs: allAttrs(paths[i]) });
        }
        if (!spec.paths.length) return null; // 没有路径就没法改外形

        const texts = g ? g.querySelectorAll('text') : root.querySelectorAll('text');
        for (let i = 0; i < texts.length; i++) {
            spec.texts.push({ attrs: allAttrs(texts[i]), text: texts[i].textContent });
        }

        if (g) {
            const children = g.children || [];
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const tag = String(child.tagName || '').toLowerCase();
                if (tag === 'path' || tag === 'text') continue;
                spec.extras.push(child);
            }
        }
        return spec;
    }

    // ============ 把外形写进积木 ============

    const patched = new Map(); // groupEl -> state

    function collectPaths(groupEl) {
        const paths = [];
        const all = groupEl.querySelectorAll('path');
        for (let i = 0; i < all.length; i++) {
            const cls = all[i].getAttribute('class') || '';
            if (cls.indexOf('blocklyPath') !== -1) paths.push(all[i]);
        }
        return paths.length ? paths : Array.prototype.slice.call(all);
    }

    function collectTexts(groupEl) {
        const all = groupEl.querySelectorAll('text');
        const texts = [];
        for (let i = 0; i < all.length; i++) {
            const cls = all[i].getAttribute('class') || '';
            if (cls.indexOf('blocklyText') !== -1) texts.push(all[i]);
        }
        return texts.length ? texts : Array.prototype.slice.call(all);
    }

    function ensureState(entry) {
        let state = patched.get(entry.groupEl);
        if (!state) {
            state = {
                groupEl: entry.groupEl,
                block: entry.block || null,
                spec: null,
                mode: 'skin',
                observer: null,
                applying: false,
                attrOrig: new Map(),  // el -> Map(属性名 -> 原值 | null)
                textOrig: new Map(),  // el -> 原文字
                extras: []            // 追加进去的节点
            };
            patched.set(entry.groupEl, state);
        }
        if (!state.block && entry.block) state.block = entry.block;
        return state;
    }

    function rememberAttr(state, el, name) {
        let m = state.attrOrig.get(el);
        if (!m) { m = new Map(); state.attrOrig.set(el, m); }
        if (!m.has(name)) m.set(name, el.getAttribute(name));
    }

    function setAttr(state, el, name, value) {
        if (value === null || value === undefined) return;
        if (el.getAttribute(name) === value) return;
        rememberAttr(state, el, name);
        el.setAttribute(name, value);
    }

    function mergeClass(state, el, value) {
        const add = splitClass(value);
        if (!add.length) return;
        const cur = splitClass(el.getAttribute('class'));
        const merged = cur.slice();
        for (let i = 0; i < add.length; i++) if (merged.indexOf(add[i]) === -1) merged.push(add[i]);
        if (merged.length === cur.length) return;
        rememberAttr(state, el, 'class');
        el.setAttribute('class', merged.join(' '));
    }

    function setText(state, el, text) {
        if (text === null || text === undefined) return;
        if (el.textContent === text) return;
        if (!state.textOrig.has(el)) state.textOrig.set(el, el.textContent);
        el.textContent = text;
    }

    function applyAttrs(state, el, attrs) {
        const names = Object.keys(attrs || {});
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            if (name === 'class') { mergeClass(state, el, attrs[name]); continue; }
            if (name === 'xmlns' || name.indexOf('xmlns:') === 0) continue;
            setAttr(state, el, name, attrs[name]);
        }
    }

    function applySpec(entry, spec, mode) {
        const state = ensureState(entry);
        state.spec = spec;
        state.mode = mode;
        const groupEl = state.groupEl;
        const full = mode === 'full';

        // 1) <g> 自己的属性
        const gNames = Object.keys(spec.gAttrs || {});
        for (let i = 0; i < gNames.length; i++) {
            const name = gNames[i];
            if (!full && G_SKIP_IN_SKIN.indexOf(name) !== -1) continue;
            if (name === 'class') { mergeClass(state, groupEl, spec.gAttrs[name]); continue; }
            if (name === 'xmlns' || name.indexOf('xmlns:') === 0) continue;
            setAttr(state, groupEl, name, spec.gAttrs[name]);
        }

        // 2) 背景路径
        const targetPaths = collectPaths(groupEl);
        if (targetPaths.length && spec.paths.length) {
            if (spec.paths.length === 1) {
                for (let i = 0; i < targetPaths.length; i++) applyAttrs(state, targetPaths[i], spec.paths[0].attrs);
            } else {
                const n = Math.min(targetPaths.length, spec.paths.length);
                for (let i = 0; i < n; i++) applyAttrs(state, targetPaths[i], spec.paths[i].attrs);
            }
        }

        // 3) 文字（一一对应，不会把一句话刷到多个输入框上）
        const targetTexts = collectTexts(groupEl);
        const textCount = Math.min(targetTexts.length, spec.texts.length);
        for (let i = 0; i < textCount; i++) {
            applyAttrs(state, targetTexts[i], spec.texts[i].attrs);
            setText(state, targetTexts[i], spec.texts[i].text);
        }

        // 4) 其它子元素（比如自己加的装饰图形）
        if (spec.extras.length && state.extras.length === 0) {
            for (let i = 0; i < spec.extras.length; i++) {
                let node = null;
                try {
                    node = document.importNode
                        ? document.importNode(spec.extras[i], true)
                        : spec.extras[i].cloneNode(true);
                } catch (e) { node = null; }
                if (!node) continue;
                groupEl.appendChild(node);
                state.extras.push(node);
            }
        }

        // 5) 盯着 Blockly 的重绘，改回去就再写一遍
        if (!state.observer && typeof MutationObserver === 'function') {
            const observer = new MutationObserver(() => {
                if (state.applying || !state.spec) return;
                state.applying = true;
                try {
                    const paths = collectPaths(state.groupEl);
                    for (let i = 0; i < paths.length; i++) {
                        const wanted = state.spec.paths.length === 1
                            ? state.spec.paths[0].attrs
                            : state.spec.paths[Math.min(i, state.spec.paths.length - 1)].attrs;
                        if (wanted && wanted.d && paths[i].getAttribute('d') !== wanted.d) {
                            paths[i].setAttribute('d', wanted.d);
                        }
                    }
                    const texts = collectTexts(state.groupEl);
                    const count = Math.min(texts.length, state.spec.texts.length);
                    for (let i = 0; i < count; i++) {
                        const wantedText = state.spec.texts[i].text;
                        if (wantedText !== null && wantedText !== undefined && texts[i].textContent !== wantedText) {
                            texts[i].textContent = wantedText;
                        }
                    }
                } finally {
                    state.applying = false;
                }
            });
            for (let i = 0; i < targetPaths.length; i++) {
                observer.observe(targetPaths[i], { attributes: true, attributeFilter: ['d'] });
            }
            for (let i = 0; i < targetTexts.length; i++) {
                observer.observe(targetTexts[i], { childList: true, characterData: true, subtree: true });
            }
            state.observer = observer;
        }
        return true;
    }

    function redrawBlock(block) {
        if (!block) return false;
        const methods = ['render', 'renderDraw_', 'queueRender'];
        for (let i = 0; i < methods.length; i++) {
            const fn = block[methods[i]];
            if (typeof fn === 'function') {
                try { fn.call(block); return true; } catch (e) { /* 试下一个 */ }
            }
        }
        return false;
    }

    function resetStates(states) {
        let count = 0;
        for (let i = 0; i < states.length; i++) {
            const state = states[i];
            if (state.observer) {
                try { state.observer.disconnect(); } catch (e) { /* 忽略 */ }
                state.observer = null;
            }
            state.spec = null;

            // 先把属性和文字还原
            state.attrOrig.forEach((m, el) => {
                m.forEach((oldValue, name) => {
                    if (oldValue === null || oldValue === undefined) {
                        try { el.removeAttribute(name); } catch (e) { /* 忽略 */ }
                    } else {
                        el.setAttribute(name, oldValue);
                    }
                });
            });
            state.textOrig.forEach((oldText, el) => {
                el.textContent = oldText;
            });

            // 再删掉我们追加的装饰节点
            for (let j = 0; j < state.extras.length; j++) {
                const node = state.extras[j];
                try {
                    if (node.parentElement) node.parentElement.removeChild(node);
                    else if (node.parentNode) node.parentNode.removeChild(node);
                } catch (e) { /* 忽略 */ }
            }
            state.extras.length = 0;

            // 让 Blockly 自己重画一遍是最干净的
            redrawBlock(state.block);
            patched.delete(state.groupEl);
            count++;
        }
        return count;
    }

    function resetAll() {
        const states = [];
        patched.forEach((state) => states.push(state));
        return resetStates(states);
    }

    // 这块积木是不是这个 data-id（或这个积木类型 / 积木 id）
    function stateMatchesId(state, id) {
        if (!id) return false;
        const groupEl = state.groupEl;
        if (groupEl && groupEl.getAttribute('data-id') === id) return true;
        const b = state.block;
        if (b && (b.id === id || b.type === id)) return true;
        return false;
    }

    function resetById(rawId) {
        const id = String(rawId === undefined || rawId === null ? '' : rawId).trim();
        if (!id) return 0;
        const states = [];
        patched.forEach((state) => {
            if (stateMatchesId(state, id)) states.push(state);
        });
        // 没被改过的积木不用恢复；但为了「按 id 恢复」的意思更完整，
        // 这里也把按 id 找到、且曾经被改过的块一并处理（上面已经覆盖）
        return resetStates(states);
    }

    // ============ 动态输入框（实验功能） ============
    //
    // 说明：这是真·往 Blockly 积木上挂输入，不是画画。
    //   · 数字输入框 → 值输入口 + math_number 影子积木（像 Scratch 那种可以打字的椭圆）
    //   · 文本输入框 → 值输入口 + text 影子积木
    //   · 数字填充框 → 空的椭圆插槽（拖数字报告积木进去）
    //   · 布尔填充框 → 空的六边形插槽（拖布尔积木进去）
    //   · 下拉框     → FieldDropdown，选项暂时是 1 / 2 / 3
    // 用的是 Blockly 的 appendValueInput / appendDummyInput / removeInput，
    // 和「自定义积木加参数」用的是同一套 API。

    const INPUT_TYPES = {
        // check 用 null：和 Scratch 自带积木一样，什么报告积木都能拖进去（形状仍是圆角插槽）
        // 只有布尔框必须给 'Boolean'，这样渲染出来才是六边形
        num: { check: null, shadow: 'math_number', shadowField: 'NUM', shadowValue: '0' },
        text: { check: null, shadow: 'text', shadowField: 'TEXT', shadowValue: '' },
        bool: { check: 'Boolean', shadow: null },
        num_slot: { check: null, shadow: null },
        dropdown: { check: null, shadow: null, dropdown: true }
    };

    const addedInputs = new Map(); // block.id -> [{ name, type }]
    let inputCounter = 0;

    function getBlockly() {
        try { if (window.Blockly) return window.Blockly; } catch (e) { /* 忽略 */ }
        try { if (window.ScratchBlocks) return window.ScratchBlocks; } catch (e) { /* 忽略 */ }
        return null;
    }

    // 拿到 DOM 对应的 Blockly 积木对象
    function findBlockObject(id, groupEl) {
        const ws = getMainWorkspace();
        if (!ws || typeof ws.getAllBlocks !== 'function') return null;
        let all = [];
        try { all = ws.getAllBlocks(false) || []; } catch (e) { return null; }

        for (let i = 0; i < all.length; i++) {
            const b = all[i];
            if (b && groupEl && b.svgGroup_ === groupEl) return b;
        }
        for (let i = 0; i < all.length; i++) {
            const b = all[i];
            if (!b) continue;
            if (b.id === id || b.type === id) return b;
            let domId = null;
            try { domId = b.svgGroup_ && b.svgGroup_.getAttribute('data-id'); } catch (e) { domId = null; }
            if (domId === id) return b;
        }
        return null;
    }

    // 整棵积木树重排（改完尺寸要重算，不然下面连着的积木会叠在一起）
    function refreshBlockTree(block) {
        let rendered = 0;
        try {
            const ws = block && block.workspace;
            if (ws && typeof ws.getAllBlocks === 'function') {
                const all = ws.getAllBlocks(false) || [];
                for (let i = 0; i < all.length && i < 500; i++) {
                    const b = all[i];
                    if (!b || typeof b.render !== 'function') continue;
                    try { b.render(); rendered++; } catch (e) { /* 单个失败不影响其它 */ }
                }
            }
        } catch (e) { /* 忽略 */ }
        if (!rendered) {
            try { block.render(); } catch (e) { /* 忽略 */ }
        }
    }

    // 造一个影子积木（数字框/文本框里的那个“值”）
    function attachShadow(block, input, def) {
        const B = getBlockly();
        const ws = block && block.workspace;
        if (!B || !ws || !input || !input.connection) return null;

        let shadow = null;
        try {
            if (typeof ws.newBlock === 'function') shadow = ws.newBlock(def.shadow);
            else if (B.Block && typeof B.Block.obtain === 'function') shadow = B.Block.obtain(ws, def.shadow);
        } catch (e) { shadow = null; }
        if (!shadow) return null;

        try {
            if (typeof shadow.setShadow === 'function') shadow.setShadow(true);
            if (typeof shadow.initSvg === 'function') shadow.initSvg();
            if (def.shadowField && typeof shadow.setFieldValue === 'function') {
                try { shadow.setFieldValue(def.shadowValue, def.shadowField); } catch (e) { /* 忽略 */ }
            }
            if (shadow.outputConnection) input.connection.connect(shadow.outputConnection);
            if (typeof shadow.render === 'function') shadow.render();
        } catch (e) { /* 忽略 */ }
        return shadow;
    }

    function addInputToBlock(block, type) {
        const B = getBlockly();
        if (!B || !block || typeof block.appendValueInput !== 'function') return false;
        const def = INPUT_TYPES[type] || INPUT_TYPES.num;
        inputCounter++;
        const name = 'EXTLAB_' + String(type).toUpperCase() + '_' + inputCounter;

        let input = null;
        try {
            input = def.dropdown
                ? block.appendDummyInput(name)
                : block.appendValueInput(name);
        } catch (e) { input = null; }
        if (!input) return false;

        if (def.check && typeof input.setCheck === 'function') {
            try { input.setCheck(def.check); } catch (e) { /* 忽略 */ }
        }

        if (def.dropdown) {
            try {
                const field = new B.FieldDropdown([['1', '1'], ['2', '2'], ['3', '3']]);
                input.appendField(field, 'VALUE');
                if (typeof field.setValue === 'function') field.setValue('1');
            } catch (e) { /* 忽略 */ }
        } else if (def.shadow) {
            attachShadow(block, input, def);
        }

        const list = addedInputs.get(block.id) || [];
        list.push({ name: name, type: type });
        addedInputs.set(block.id, list);

        refreshBlockTree(block);
        return true;
    }

    function removeInputByName(block, name) {
        let input = null;
        try { input = block.getInput ? block.getInput(name) : null; } catch (e) { input = null; }
        if (input && input.connection) {
            let target = null;
            try { target = input.connection.targetBlock(); } catch (e) { target = null; }
            if (target) {
                let isShadow = false;
                try { isShadow = target.isShadow ? !!target.isShadow() : false; } catch (e) { isShadow = false; }
                if (isShadow) {
                    try { target.dispose(); } catch (e) { /* 忽略 */ }
                } else {
                    // 用户自己拖进去的积木不删，只断开
                    try { input.connection.disconnect(); } catch (e) { /* 忽略 */ }
                }
            }
        }
        try { block.removeInput(name); } catch (e) { /* 忽略 */ }
    }

    function removeLastInputOfType(block, type) {
        const list = addedInputs.get(block.id);
        if (!list || !list.length) return false;
        let index = -1;
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].type === type) { index = i; break; }
        }
        if (index === -1) return false;
        const entry = list[index];
        list.splice(index, 1);
        if (!list.length) addedInputs.delete(block.id);
        removeInputByName(block, entry.name);
        refreshBlockTree(block);
        return true;
    }

    function removeAllAddedInputs(block) {
        const list = addedInputs.get(block.id);
        if (!list || !list.length) return 0;
        const entries = list.slice();
        addedInputs.delete(block.id);
        for (let i = 0; i < entries.length; i++) removeInputByName(block, entries[i].name);
        refreshBlockTree(block);
        return entries.length;
    }

    // ============ 积木 ============

    const extension = {
        getInfo() {
            return {
                id: EXTENSION_ID,
                name: '积木外形实验',
                color1: '#FF3355',
                color2: '#FF6680',
                blocks: [
                    {
                        opcode: TARGET_OPCODE, // 就是 a_block
                        blockType: Scratch.BlockType.COMMAND,
                        text: TARGET_LABEL
                    },
                    '---',
                    {
                        opcode: 'setShape',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '把 a_block 积木的外形改成 [PATH] [MODE]',
                        arguments: {
                            PATH: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: ''
                            },
                            MODE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'modeMenu',
                                defaultValue: 'skin'
                            }
                        }
                    },
                    {
                        opcode: 'resetShape',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '把 a_block 积木恢复原样'
                    },
                    '---',
                    {
                        opcode: 'setShapeById',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '把 data-id 为 [ID] 的积木的外形改成 [PATH] [MODE]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: TARGET_FULL_ID
                            },
                            PATH: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: ''
                            },
                            MODE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'modeMenu',
                                defaultValue: 'skin'
                            }
                        }
                    },
                    {
                        opcode: 'resetShapeById',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '把 data-id 为 [ID] 的积木恢复原样',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: TARGET_FULL_ID
                            }
                        }
                    },
                    '---',
                    {
                        opcode: 'editInput',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '在 data-id 为 [ID] 的积木上 [ACTION] [TYPE]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: TARGET_FULL_ID
                            },
                            ACTION: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'inputActionMenu',
                                defaultValue: 'add'
                            },
                            TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'inputTypeMenu',
                                defaultValue: 'num'
                            }
                        }
                    }
                ],
                menus: {
                    modeMenu: {
                        acceptReporters: false,
                        items: [
                            { text: '只套外观 / 保留位置', value: 'skin' },
                            { text: '原样套用 / 含坐标', value: 'full' }
                        ]
                    },
                    inputActionMenu: {
                        acceptReporters: false,
                        items: [
                            { text: '添加', value: 'add' },
                            { text: '删除一个', value: 'remove' },
                            { text: '全部删除', value: 'clear' }
                        ]
                    },
                    inputTypeMenu: {
                        acceptReporters: false,
                        items: [
                            { text: '数字输入框', value: 'num' },
                            { text: '文本输入框', value: 'text' },
                            { text: '布尔填充框', value: 'bool' },
                            { text: '数字填充框', value: 'num_slot' },
                            { text: '下拉框 1/2/3', value: 'dropdown' }
                        ]
                    }
                }
            };
        },

        // a_block 本身什么也不做，只是给上面那条积木一个“靶子”
        a_block() {
            return;
        },

        setShape(args) {
            const spec = parseSpec(args ? args.PATH : '');
            if (!spec) {
                warn('输入里没找到路径（需要 <g>/<path d="..."> 或直接给 d 的内容）');
                return;
            }
            const mode = (args && String(args.MODE) === 'full') ? 'full' : 'skin';
            const entries = findEntriesByType();
            if (!entries.length) {
                warn('工作区里还没有 a_block 积木，先把「这是个实验积木」拖到舞台上试试');
                return;
            }
            let ok = 0;
            for (let i = 0; i < entries.length; i++) {
                if (applySpec(entries[i], spec, mode)) ok++;
            }
            if (!ok) warn('找到了 a_block 积木，但它没有可以改的 SVG 路径');
        },

        resetShape() {
            resetAll();
        },

        setShapeById(args) {
            const id = String(args && args.ID !== undefined && args.ID !== null ? args.ID : '').trim();
            if (!id) {
                warn('data-id 不能为空');
                return;
            }
            const spec = parseSpec(args ? args.PATH : '');
            if (!spec) {
                warn('输入里没找到路径（需要 <g>/<path d="..."> 或直接给 d 的内容）');
                return;
            }
            const mode = (args && String(args.MODE) === 'full') ? 'full' : 'skin';
            const entries = findEntriesByDataId(id);
            if (!entries.length) {
                warn('工作区里没找到 data-id 为 ' + id + ' 的积木');
                return;
            }
            let ok = 0;
            for (let i = 0; i < entries.length; i++) {
                if (applySpec(entries[i], spec, mode)) ok++;
            }
            if (!ok) warn('data-id 为 ' + id + ' 的积木没有可以改的 SVG 路径');
        },

        resetShapeById(args) {
            const id = String(args && args.ID !== undefined && args.ID !== null ? args.ID : '').trim();
            if (!id) {
                warn('data-id 不能为空');
                return;
            }
            const count = resetById(id);
            if (!count) warn('data-id 为 ' + id + ' 的积木没有被改过');
        },

        editInput(args) {
            const id = String(args && args.ID !== undefined && args.ID !== null ? args.ID : '').trim();
            if (!id) {
                warn('data-id 不能为空');
                return;
            }
            const action = String((args && args.ACTION) || 'add');
            const type = String((args && args.TYPE) || 'num');

            const entries = findEntriesByDataId(id);
            if (!entries.length) {
                warn('工作区里没找到 data-id 为 ' + id + ' 的积木');
                return;
            }

            let ok = 0;
            for (let i = 0; i < entries.length; i++) {
                const block = findBlockObject(id, entries[i].groupEl) || entries[i].block;
                if (!block) continue;
                if (action === 'add') {
                    if (addInputToBlock(block, type)) ok++;
                } else if (action === 'remove') {
                    if (removeLastInputOfType(block, type)) ok++;
                } else if (action === 'clear') {
                    ok += removeAllAddedInputs(block);
                }
            }

            if (!ok) {
                if (action === 'add') warn('没能添加输入框：可能需要 Blockly 的 appendValueInput（当前平台不支持）');
                else if (action === 'remove') warn('这块积木上没有本扩展加过的「' + type + '」输入框');
                else warn('这块积木上没有本扩展加过的输入框');
            }
        }
    };

    Scratch.extensions.register(extension);
})(Scratch);