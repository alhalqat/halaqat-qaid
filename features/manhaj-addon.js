(function manhajAddonV1() {
  'use strict';

  var STORE_KEY = 'manhajAddon';
  var UI = {
    supervisionTab: 'supervision',
    builderOpen: false,
    previewOpen: false,
    editingPlanId: '',
    selectedProgressPlanId: '',
    progressRowsByPlan: {},
    progressLoading: false,
    progressError: '',
    progressLoadToken: '',
    draft: null,
    picker: {
      open: false,
      lessonIdx: 0,
      part: 'hifdh',
      search: '',
      filter: 'all',
    },
    teacherTab: 'halaqas',
    teacherHalaqaId: '',
    teacherPendingAction: 'normal',
    teacherRefreshQueued: false,
    lessonCache: {},
    lessonFetchPending: {},
  };

  function hasRuntime() {
    if (typeof window === 'undefined') return false;
    if (typeof state !== 'undefined' && !!state && typeof state === 'object') return true;
    return typeof window.state === 'object' && !!window.state;
  }

  function safeUser() {
    return typeof window.currentUser === 'function' ? window.currentUser() : null;
  }

  function isTeacherUser() {
    var u = safeUser();
    return !!u && u.role === 'teacher';
  }

  function makeId(prefix) {
    if (typeof window.uid === 'function') return window.uid(prefix || 'id');
    return String(prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function esc(value) {
    if (typeof window.escapeAttr === 'function') return window.escapeAttr(String(value == null ? '' : value));
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toEnglish(value) {
    if (typeof window.toEnglishDigits === 'function') return window.toEnglishDigits(String(value == null ? '' : value));
    return String(value == null ? '' : value)
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
      .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); });
  }

  function toInt(value, fallback) {
    var raw = toEnglish(value).replace(/[^\d]/g, '');
    if (!raw) return Number(fallback || 0);
    var n = Number(raw);
    return Number.isFinite(n) ? n : Number(fallback || 0);
  }

  function clampNum(value, min, max) {
    if (typeof window.clamp === 'function') return window.clamp(Number(value || 0), Number(min), Number(max));
    var n = Number(value || 0);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function today() {
    if (typeof window.todayISO === 'function') return window.todayISO();
    return new Date().toISOString().slice(0, 10);
  }

  function ensureStore() {
    if (!hasRuntime() || !state.db) return { plans: [] };
    if (!state.db.settings || typeof state.db.settings !== 'object') state.db.settings = {};
    if (!state.db.settings[STORE_KEY] || typeof state.db.settings[STORE_KEY] !== 'object') {
      state.db.settings[STORE_KEY] = { plans: [] };
    }
    if (!Array.isArray(state.db.settings[STORE_KEY].plans)) state.db.settings[STORE_KEY].plans = [];
    return state.db.settings[STORE_KEY];
  }

  function getPlans() {
    return ensureStore().plans;
  }

  function saveAddon() {
    if (typeof window.saveDB === 'function') window.saveDB();
  }

  function getRealtimeDatabaseRef(path) {
    try {
      if (typeof database !== 'undefined' && database && typeof database.ref === 'function') {
        return database.ref(String(path || '').replace(/^\/+/, ''));
      }
    } catch (_e) {}
    try {
      if (window.database && typeof window.database.ref === 'function') {
        return window.database.ref(String(path || '').replace(/^\/+/, ''));
      }
    } catch (_e2) {}
    return null;
  }

  function getCachedLesson(studentId, fallback) {
    var key = String(studentId || '');
    if (!key) return Number(fallback || 1);
    if (Object.prototype.hasOwnProperty.call(UI.lessonCache, key)) {
      var cached = Number(UI.lessonCache[key]);
      if (Number.isFinite(cached) && cached >= 1) return Math.floor(cached);
    }
    return Number(fallback || 1);
  }

  function setCachedLesson(studentId, lessonNumber) {
    var key = String(studentId || '');
    if (!key) return;
    var n = Number(lessonNumber || 1);
    UI.lessonCache[key] = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }

  function readCurrentLessonFromFirebase(studentId, options) {
    var opts = options || {};
    var key = String(studentId || '');
    if (!key) return Promise.resolve(1);
    if (!opts.fresh && Object.prototype.hasOwnProperty.call(UI.lessonCache, key)) {
      return Promise.resolve(getCachedLesson(key, 1));
    }
    if (UI.lessonFetchPending[key]) return UI.lessonFetchPending[key];

    var ref = getRealtimeDatabaseRef('students/' + key + '/currentLesson');
    if (!ref) {
      var fallback = getCachedLesson(key, 1);
      setCachedLesson(key, fallback);
      return Promise.resolve(fallback);
    }

    UI.lessonFetchPending[key] = ref.once('value')
      .then(function (snapshot) {
        var raw = snapshot && typeof snapshot.val === 'function' ? snapshot.val() : 1;
        var n = Number(raw);
        var lesson = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
        setCachedLesson(key, lesson);
        return lesson;
      })
      .catch(function () {
        var fallback = getCachedLesson(key, 1);
        setCachedLesson(key, fallback);
        return fallback;
      })
      .finally(function () {
        delete UI.lessonFetchPending[key];
      });

    return UI.lessonFetchPending[key];
  }

  function writeCurrentLessonToFirebase(studentId, lessonNumber) {
    var key = String(studentId || '');
    if (!key) return Promise.resolve(false);
    var target = clampNum(Number(lessonNumber || 1), 1, 9999);
    var ref = getRealtimeDatabaseRef('students/' + key + '/currentLesson');
    if (!ref) return Promise.resolve(false);
    return ref.set(target)
      .then(function () {
        setCachedLesson(key, target);
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function queueTeacherRefresh() {
    if (UI.teacherRefreshQueued) return;
    UI.teacherRefreshQueued = true;
    setTimeout(function () {
      UI.teacherRefreshQueued = false;
      refreshTeacherView();
    }, 0);
  }

  function allHalaqas() {
    return Array.isArray(state.db && state.db.halaqas) ? state.db.halaqas.slice() : [];
  }

  function visibleHalaqaList() {
    if (typeof window.visibleHalaqas === 'function') {
      try {
        var out = window.visibleHalaqas();
        if (Array.isArray(out)) return out.slice();
      } catch (_e) {}
    }
    var u = safeUser();
    var all = allHalaqas();
    if (!u) return [];
    if (u.role === 'admin') return all;
    if (u.role === 'supervisor') {
      return all.filter(function (h) { return String(h.section || 'mens') === String(u.section || 'mens'); });
    }
    if (u.role === 'teacher') {
      var allow = new Set(Array.isArray(u.assignedHalaqaIds) ? u.assignedHalaqaIds : []);
      return all.filter(function (h) { return allow.has(h.id); });
    }
    return all;
  }

  function halaqaById(id) {
    var list = allHalaqas();
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i].id) === String(id)) return list[i];
    }
    return null;
  }

  function sectionLabel(section) {
    return String(section) === 'womens' ? 'البنات' : 'البنين';
  }

  function getSurahData() {
    if (Array.isArray(window.SURAH_DATA)) return window.SURAH_DATA;
    if (typeof SURAH_DATA !== 'undefined' && Array.isArray(SURAH_DATA)) return SURAH_DATA;
    return [];
  }

  function surahListDesc() {
    var data = getSurahData().slice();
    return data.sort(function (a, b) { return Number(b.n || 0) - Number(a.n || 0); });
  }

  function surahByIdx(idx) {
    var data = getSurahData();
    var n = Number(idx);
    if (!Number.isFinite(n) || n < 0 || n >= data.length) return null;
    return data[n];
  }

  function surahLabelFromIdx(idx) {
    var s = surahByIdx(idx);
    if (!s) return 'سورة غير معروفة';
    return s.n + '. ' + s.name + ' (' + s.a + ')';
  }

  function maxAyaForSurahIdx(idx) {
    var s = surahByIdx(idx);
    return Number(s && s.a ? s.a : 1);
  }

  function normalizeEntry(raw) {
    var surahIdx = Number(raw && raw.surahIdx);
    if (!Number.isFinite(surahIdx) || surahIdx < 0 || surahIdx >= getSurahData().length) {
      surahIdx = 0;
    }
    var maxAya = maxAyaForSurahIdx(surahIdx);
    var fromAya = clampNum(toInt(raw && raw.fromAya, 1), 1, maxAya);
    var toAya = clampNum(toInt(raw && raw.toAya, maxAya), 1, maxAya);
    return {
      id: String((raw && raw.id) || makeId('mrow')),
      surahIdx: surahIdx,
      fromAya: fromAya,
      toAya: toAya,
    };
  }

  function seedLesson(index) {
    return {
      id: makeId('lesson'),
      title: 'الدرس ' + String(Number(index || 0) + 1),
      hifdh: [],
      revision: [],
    };
  }

  function normalizeLesson(raw, index) {
    var base = raw && typeof raw === 'object' ? raw : {};
    return {
      id: String(base.id || makeId('lesson')),
      title: String(base.title || ('الدرس ' + String(Number(index || 0) + 1))),
      hifdh: (Array.isArray(base.hifdh) ? base.hifdh : []).map(normalizeEntry),
      revision: (Array.isArray(base.revision) ? base.revision : []).map(normalizeEntry),
    };
  }

  function normalizePlan(raw) {
    var base = raw && typeof raw === 'object' ? raw : {};
    var lessonCount = clampNum(toInt(base.plannedLessons, 1), 1, 120);
    var lessons = (Array.isArray(base.lessons) ? base.lessons : []).map(function (l, idx) {
      return normalizeLesson(l, idx);
    });
    while (lessons.length < lessonCount) lessons.push(seedLesson(lessons.length));
    if (lessons.length > lessonCount) lessons = lessons.slice(0, lessonCount);
    return {
      id: String(base.id || makeId('plan')),
      name: String(base.name || 'منهج جديد'),
      halaqaId: String(base.halaqaId || ''),
      section: String(base.section || 'mens') === 'womens' ? 'womens' : 'mens',
      plannedLessons: lessonCount,
      lessons: lessons,
      createdAt: String(base.createdAt || new Date().toISOString()),
      updatedAt: String(base.updatedAt || new Date().toISOString()),
    };
  }

  function planForHalaqa(halaqaId) {
    var list = getPlans()
      .map(normalizePlan)
      .filter(function (p) { return String(p.halaqaId) === String(halaqaId); })
      .sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
    return list[0] || null;
  }

  function sortedStudentsForHalaqa(halaqaId) {
    var rows = [];
    if (state.indexes && state.indexes.studentsByHalaqa && Array.isArray(state.indexes.studentsByHalaqa[halaqaId])) {
      rows = state.indexes.studentsByHalaqa[halaqaId].slice();
    } else if (Array.isArray(state.db && state.db.students)) {
      rows = state.db.students.filter(function (s) { return String(s.halaqaId) === String(halaqaId); });
    }
    return rows.sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
  }

  function overlapCount(aFrom, aTo, bFrom, bTo) {
    var left = Math.max(Number(aFrom || 0), Number(bFrom || 0));
    var right = Math.min(Number(aTo || 0), Number(bTo || 0));
    if (right < left) return 0;
    return right - left + 1;
  }

  function entryPlannedAya(entry) {
    var maxAya = maxAyaForSurahIdx(entry.surahIdx);
    var fromAya = clampNum(toInt(entry.fromAya, 1), 1, maxAya);
    var toAya = clampNum(toInt(entry.toAya, maxAya), 1, maxAya);
    return Math.max(0, toAya - fromAya + 1);
  }

  function buildLessonItems(lesson) {
    var out = [];
    (Array.isArray(lesson.hifdh) ? lesson.hifdh : []).forEach(function (row) {
      out.push({ type: 'hifdh', entry: normalizeEntry(row) });
    });
    (Array.isArray(lesson.revision) ? lesson.revision : []).forEach(function (row) {
      out.push({ type: 'revision', entry: normalizeEntry(row) });
    });
    return out;
  }

  function lessonStatsFromLogs(logs, lesson) {
    var items = buildLessonItems(lesson);
    var planned = 0;
    var covered = 0;
    var grades = [];

    items.forEach(function (item) {
      var plannedAya = entryPlannedAya(item.entry);
      planned += plannedAya;
      var itemCovered = 0;

      (logs || []).forEach(function (log) {
        if (String(log.type || '') !== String(item.type || '')) return;
        if (Number(log.surahIdx) !== Number(item.entry.surahIdx)) return;
        var maxAya = maxAyaForSurahIdx(item.entry.surahIdx);
        var pFrom = clampNum(toInt(item.entry.fromAya, 1), 1, maxAya);
        var pTo = clampNum(toInt(item.entry.toAya, maxAya), 1, maxAya);
        var lFrom = clampNum(toInt(log.fromAya, 1), 1, maxAya);
        var lTo = clampNum(toInt(log.toAya, maxAya), 1, maxAya);
        itemCovered += overlapCount(pFrom, pTo, lFrom, lTo);
        var gradeNum = Number(log.grade);
        if (Number.isFinite(gradeNum)) grades.push(gradeNum);
      });

      itemCovered = Math.min(itemCovered, plannedAya);
      covered += itemCovered;
    });

    var complete = planned > 0 ? covered >= planned : false;
    var status = complete ? 'مكتمل' : (covered > 0 ? 'قيد التنفيذ' : 'قادم');
    var gradeAvg = grades.length
      ? Math.round((grades.reduce(function (sum, g) { return sum + g; }, 0) / grades.length) * 10) / 10
      : null;
    return {
      planned: planned,
      covered: covered,
      complete: complete,
      status: status,
      gradeAvg: gradeAvg,
      percent: planned > 0 ? clampNum(Math.round((covered / planned) * 100), 0, 100) : 0,
    };
  }

  function progressForStudentInPlan(plan, studentId) {
    var p = normalizePlan(plan || {});
    var logs = (Array.isArray(state.db && state.db.logs) ? state.db.logs : []).filter(function (l) {
      return String(l.studentId) === String(studentId) && String(l.halaqaId) === String(p.halaqaId);
    });

    var lessonStats = p.lessons.map(function (lesson, idx) {
      var stats = lessonStatsFromLogs(logs, lesson);
      return {
        index: idx,
        lesson: lesson,
        stats: stats,
      };
    });

    var totalPlanned = lessonStats.reduce(function (s, row) { return s + Number(row.stats.planned || 0); }, 0);
    var totalCovered = lessonStats.reduce(function (s, row) { return s + Number(row.stats.covered || 0); }, 0);
    var completedLessons = lessonStats.filter(function (row) { return row.stats.complete; }).length;

    var currentLessonIdx = 0;
    var found = false;
    for (var i = 0; i < lessonStats.length; i += 1) {
      if (!lessonStats[i].stats.complete) {
        currentLessonIdx = i;
        found = true;
        break;
      }
    }
    if (!found && lessonStats.length) currentLessonIdx = lessonStats.length - 1;

    var currentLesson = lessonStats[currentLessonIdx] || null;

    return {
      percent: totalPlanned > 0 ? clampNum(Math.round((totalCovered / totalPlanned) * 100), 0, 100) : 0,
      totalPlanned: totalPlanned,
      totalCovered: totalCovered,
      completedLessons: completedLessons,
      totalLessons: lessonStats.length,
      currentLessonIdx: currentLessonIdx,
      currentLessonLabel: currentLesson
        ? (currentLesson.lesson.title || ('الدرس ' + String(currentLessonIdx + 1)))
        : 'لا يوجد',
      lessonStats: lessonStats,
    };
  }

  function lessonSummaryText(lesson) {
    var hifdh = (Array.isArray(lesson.hifdh) ? lesson.hifdh : []).map(function (row) {
      var s = surahByIdx(row.surahIdx);
      if (!s) return '—';
      return s.name + ' (' + row.fromAya + '-' + row.toAya + ')';
    }).join(' + ') || '—';

    var revision = (Array.isArray(lesson.revision) ? lesson.revision : []).map(function (row) {
      var s = surahByIdx(row.surahIdx);
      if (!s) return '—';
      return s.name + ' (' + row.fromAya + '-' + row.toAya + ')';
    }).join(' + ') || '—';

    return 'حفظ: ' + hifdh + ' | مراجعة: ' + revision;
  }

  function lessonEntryText(entry) {
    var row = normalizeEntry(entry || {});
    var surah = surahByIdx(row.surahIdx);
    if (!surah) return '—';
    return surah.name + ' ' + row.fromAya + '-' + row.toAya;
  }

  function lessonPartText(lesson, part) {
    var rows = Array.isArray(lesson && lesson[part]) ? lesson[part] : [];
    if (!rows.length) return '—';
    return rows.map(function (row) { return lessonEntryText(row); }).join(' + ');
  }

  function pickLessonMainSurahName(lesson) {
    var hifdh = Array.isArray(lesson && lesson.hifdh) ? lesson.hifdh : [];
    var revision = Array.isArray(lesson && lesson.revision) ? lesson.revision : [];
    var row = hifdh[0] || revision[0] || null;
    if (!row) return '—';
    var surah = surahByIdx(row.surahIdx);
    return surah ? surah.name : '—';
  }

  function statusByPercent(percent) {
    var p = Number(percent || 0);
    if (p >= 70) return { label: 'منتظم', cls: 'ok' };
    if (p >= 35) return { label: 'يمكن تحسين', cls: 'warn' };
    return { label: 'متأخر', cls: 'late' };
  }

  function planTotalLessons(plan) {
    var p = normalizePlan(plan || {});
    return Math.max(1, Number(p.lessons.length || p.plannedLessons || 1));
  }

  function normalizeLessonNumberForPlan(plan, lessonNumber) {
    var total = planTotalLessons(plan);
    var raw = Number(lessonNumber || 1);
    var n = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
    if (n > total) n = total;
    return n;
  }

  function lessonRowForPlan(plan, lessonNumber) {
    var p = normalizePlan(plan || {});
    if (!p.lessons.length) return null;
    var n = normalizeLessonNumberForPlan(p, lessonNumber);
    return p.lessons[n - 1] || null;
  }

  function initDraft(planId) {
    var source = null;
    var plans = getPlans();
    for (var i = 0; i < plans.length; i += 1) {
      if (String(plans[i].id) === String(planId || '')) {
        source = plans[i];
        break;
      }
    }

    if (!source) {
      var hs = visibleHalaqaList();
      var first = hs[0] || null;
      UI.draft = normalizePlan({
        id: makeId('plan'),
        name: 'منهج جديد',
        halaqaId: first ? first.id : '',
        section: first ? first.section : 'mens',
        plannedLessons: 8,
        lessons: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      UI.editingPlanId = '';
    } else {
      UI.draft = normalizePlan(source);
      UI.editingPlanId = String(source.id || '');
    }

    syncDraftSectionFromHalaqa();
    UI.builderOpen = true;
    UI.previewOpen = false;
    UI.picker = { open: false, lessonIdx: 0, part: 'hifdh', search: '', filter: 'all' };
  }

  function syncDraftSectionFromHalaqa() {
    if (!UI.draft) return;
    var h = halaqaById(UI.draft.halaqaId);
    UI.draft.section = h && h.section === 'womens' ? 'womens' : 'mens';
  }

  function syncDraftLessonsCount() {
    if (!UI.draft) return;
    var count = clampNum(toInt(UI.draft.plannedLessons, 1), 1, 120);
    UI.draft.plannedLessons = count;
    while (UI.draft.lessons.length < count) UI.draft.lessons.push(seedLesson(UI.draft.lessons.length));
    if (UI.draft.lessons.length > count) UI.draft.lessons = UI.draft.lessons.slice(0, count);
  }

  function buildPlanProgressRow(plan, student, lessonNumber) {
    var p = normalizePlan(plan || {});
    var total = planTotalLessons(p);
    var currentLesson = normalizeLessonNumberForPlan(p, lessonNumber);
    var current = lessonRowForPlan(p, currentLesson);
    var percent = total > 0 ? clampNum(Math.round(((currentLesson - 1) / total) * 100), 0, 100) : 0;
    var status = statusByPercent(percent);
    return {
      student: student,
      currentLesson: currentLesson,
      totalLessons: total,
      currentSurahName: pickLessonMainSurahName(current),
      percent: percent,
      statusLabel: status.label,
      statusCls: status.cls,
    };
  }

  function ensureProgressRowsLoaded(plan) {
    var p = normalizePlan(plan || {});
    if (!p.id || !p.halaqaId) return;
    var planId = String(p.id);
    if (UI.progressRowsByPlan[planId] && Array.isArray(UI.progressRowsByPlan[planId])) return;
    if (UI.progressLoading && UI.progressLoadToken && UI.progressLoadToken.indexOf(planId + ':') === 0) return;

    UI.progressLoading = true;
    UI.progressError = '';
    var token = planId + ':' + makeId('load');
    UI.progressLoadToken = token;

    var students = sortedStudentsForHalaqa(p.halaqaId);
    Promise.all(students.map(function (student) {
      return readCurrentLessonFromFirebase(student.id, { fresh: true })
        .then(function (lessonNumber) {
          return buildPlanProgressRow(p, student, lessonNumber);
        });
    }))
      .then(function (rows) {
        if (UI.progressLoadToken !== token) return;
        UI.progressRowsByPlan[planId] = rows;
      })
      .catch(function () {
        if (UI.progressLoadToken !== token) return;
        UI.progressError = 'تعذر قراءة تقدم الطلاب من Firebase حالياً.';
      })
      .finally(function () {
        if (UI.progressLoadToken !== token) return;
        UI.progressLoading = false;
        refreshSupervisionView();
      });
  }

  function supervisionProgressSectionHtml(plans) {
    var list = Array.isArray(plans) ? plans : [];
    if (!list.length) {
      return '<div class="card"><h3 style="margin-bottom:8px;">تقدم الطلاب</h3><p class="muted">لا توجد مناهج لعرض التقدم.</p></div>';
    }

    if (!UI.selectedProgressPlanId || !list.some(function (p) { return String(p.id) === String(UI.selectedProgressPlanId); })) {
      UI.selectedProgressPlanId = String(list[0].id || '');
    }

    var selected = list.find(function (p) { return String(p.id) === String(UI.selectedProgressPlanId); }) || list[0];
    if (!selected) return '';

    ensureProgressRowsLoaded(selected);
    var rows = UI.progressRowsByPlan[String(selected.id)] || [];

    var rowsHtml = rows.length
      ? rows.map(function (row, idx) {
          return [
            '<tr>',
            '  <td>' + String(idx + 1) + '</td>',
            '  <td>' + esc(row.student && row.student.name ? row.student.name : '-') + '</td>',
            '  <td>درس ' + Number(row.currentLesson) + ' من ' + Number(row.totalLessons) + '</td>',
            '  <td>' + esc(row.currentSurahName || '—') + '</td>',
            '  <td><div class="manhaj-mini-progress"><span style="width:' + Number(row.percent) + '%"></span></div><div style="font-size:12px; margin-top:4px;">' + Number(row.percent) + '%</div></td>',
            '  <td><span class="manhaj-status-pill ' + esc(row.statusCls) + '">' + esc(row.statusLabel) + '</span></td>',
            '</tr>'
          ].join('');
        }).join('')
      : '<tr><td colspan="6" class="muted">لا توجد بيانات تقدم حتى الآن.</td></tr>';

    return [
      '<div class="card">',
      '  <div class="row between" style="gap:8px; flex-wrap:wrap;">',
      '    <h3 style="margin:0;">تقدم الطلاب</h3>',
      '    <div class="field-block" style="min-width:260px;">',
      '      <div class="field-label">اختر المنهج</div>',
      '      <select onchange="manhajSelectProgressPlan(this.value)">',
      list.map(function (p) {
        return '<option value="' + esc(String(p.id || '')) + '" ' + (String(p.id) === String(selected.id) ? 'selected' : '') + '>' + esc(p.name || '-') + '</option>';
      }).join(''),
      '      </select>',
      '    </div>',
      '  </div>',
      '  ' + (UI.progressLoading ? '<p class="muted" style="margin-top:8px;">جار قراءة التقدم من Firebase...</p>' : ''),
      '  ' + (UI.progressError ? '<p style="color:#b91c1c; margin-top:8px;">' + esc(UI.progressError) + '</p>' : ''),
      '  <div class="manhaj-progress-table-wrap" style="margin-top:8px;">',
      '    <table class="manhaj-progress-table">',
      '      <thead><tr><th>#</th><th>اسم الطالب</th><th>الدرس الحالي</th><th>السورة الحالية</th><th>التقدم</th><th>الحالة</th></tr></thead>',
      '      <tbody>' + rowsHtml + '</tbody>',
      '    </table>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function renderSupervisionAddon() {
    var view = document.getElementById('view-supervision');
    if (!view) return;

    var tabs = view.querySelector('.manhaj-super-tabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.className = 'manhaj-super-tabs no-print';
      view.insertBefore(tabs, view.firstChild);
    }

    var host = view.querySelector('.manhaj-super-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'manhaj-super-host hidden';
      if (tabs.nextSibling) view.insertBefore(host, tabs.nextSibling);
      else view.appendChild(host);
    }

    tabs.innerHTML = [
      '<button type="button" class="manhaj-super-tab ' + (UI.supervisionTab === 'supervision' ? 'active' : '') + '" onclick="manhajSetSupervisionTab(\'supervision\')">الإشراف</button>',
      '<button type="button" class="manhaj-super-tab ' + (UI.supervisionTab === 'manhaj' ? 'active' : '') + '" onclick="manhajSetSupervisionTab(\'manhaj\')">المناهج</button>'
    ].join('');

    var children = Array.prototype.slice.call(view.children);
    var originals = children.filter(function (node) {
      return !node.classList.contains('manhaj-super-tabs') && !node.classList.contains('manhaj-super-host');
    });

    if (UI.supervisionTab === 'manhaj') {
      originals.forEach(function (node) { node.classList.add('manhaj-hidden'); });
      host.classList.remove('hidden');
      host.innerHTML = supervisionManhajPanelHtml();
    } else {
      originals.forEach(function (node) { node.classList.remove('manhaj-hidden'); });
      host.classList.add('hidden');
      host.innerHTML = '';
      UI.builderOpen = false;
      UI.previewOpen = false;
      UI.picker.open = false;
    }
  }

  function supervisionManhajPanelHtml() {
    var u = safeUser();
    var canManage = !!u && (u.role === 'admin' || u.role === 'supervisor');
    if (!canManage) {
      return '<div class="card"><p class="muted">تبويب المناهج متاح للإدارة والمشرفين فقط.</p></div>';
    }

    var allowedSections = new Set();
    if (u.role === 'admin') {
      allowedSections.add('mens');
      allowedSections.add('womens');
    } else {
      allowedSections.add(String(u.section || 'mens'));
    }

    var plans = getPlans()
      .map(normalizePlan)
      .filter(function (p) { return allowedSections.has(p.section); })
      .sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });

    var listHtml = plans.length
      ? plans.map(function (p) {
          var h = halaqaById(p.halaqaId);
          return [
            '<div class="manhaj-plan-row">',
            '  <div>',
            '    <div class="manhaj-plan-title">' + esc(p.name || '-') + '</div>',
            '    <div class="manhaj-plan-meta">',
            '      الحلقة: ' + esc(h ? h.circleName : 'غير مسندة') + ' • ',
            '      القسم: ' + sectionLabel(p.section) + ' • ',
            '      الدروس: ' + Number(p.lessons.length || 0),
            '    </div>',
            '  </div>',
            '  <div class="row" style="gap:6px;">',
            '    <button class="btn btn-light" onclick="manhajEditPlan(\'' + esc(String(p.id)) + '\')">تعديل</button>',
            '  </div>',
            '</div>'
          ].join('');
        }).join('')
      : '<div class="card"><p class="muted">لا توجد مناهج محفوظة حتى الآن.</p></div>';

    var builderHtml = UI.builderOpen ? builderOverlayHtml() : '';
    var progressHtml = supervisionProgressSectionHtml(plans);

    return [
      '<div class="card">',
      '  <div class="row between" style="gap:8px; flex-wrap:wrap;">',
      '    <div>',
      '      <h3 style="margin-bottom:4px;">المناهج</h3>',
      '      <p class="muted" style="font-size:12px;">إضافة مناهج للحلقات وربطها تلقائياً بواجهة المعلم وولي الأمر.</p>',
      '    </div>',
      '    <button class="btn btn-primary" onclick="manhajOpenBuilder()">+ منهج جديد</button>',
      '  </div>',
      '</div>',
      '<div class="card">',
      '  <h3 style="margin-bottom:8px;">قائمة المناهج</h3>',
      '  <div class="manhaj-plan-list">' + listHtml + '</div>',
      '</div>',
      progressHtml,
      builderHtml
    ].join('');
  }

  function draftHalaqaOptionsHtml() {
    var hs = visibleHalaqaList();
    var selected = UI.draft ? String(UI.draft.halaqaId || '') : '';
    if (!hs.length) return '<option value="">لا توجد حلقات متاحة</option>';
    return hs.map(function (h) {
      var value = String(h.id || '');
      return '<option value="' + esc(value) + '" ' + (selected === value ? 'selected' : '') + '>' + esc(h.circleName || '-') + ' (' + sectionLabel(h.section) + ')</option>';
    }).join('');
  }

  function renderLessonEntries(lessonIdx, part, entries) {
    if (!Array.isArray(entries) || !entries.length) {
      return '<div class="muted" style="font-size:12px;">لا توجد سور مضافة.</div>';
    }

    return entries.map(function (entry) {
      var s = surahByIdx(entry.surahIdx);
      var maxAya = maxAyaForSurahIdx(entry.surahIdx);
      var id = String(entry.id || '');
      var title = s ? (s.n + '. ' + s.name + ' (' + s.a + ')') : 'سورة غير معروفة';
      return [
        '<div class="manhaj-entry-row">',
        '  <div class="manhaj-entry-title">' + esc(title) + '</div>',
        '  <label>من آية',
        '    <input type="text" inputmode="numeric" dir="ltr" value="' + esc(entry.fromAya) + '" onchange="manhajUpdateEntry(' + Number(lessonIdx) + ',\'' + esc(part) + '\',\'' + esc(id) + '\',\'fromAya\',this.value)" />',
        '  </label>',
        '  <label>إلى آية',
        '    <input type="text" inputmode="numeric" dir="ltr" value="' + esc(entry.toAya) + '" onchange="manhajUpdateEntry(' + Number(lessonIdx) + ',\'' + esc(part) + '\',\'' + esc(id) + '\',\'toAya\',this.value)" />',
        '  </label>',
        '  <span class="badge">الحد الأقصى: ' + Number(maxAya) + '</span>',
        '  <button type="button" class="btn btn-light" onclick="manhajSetEntryComplete(' + Number(lessonIdx) + ',\'' + esc(part) + '\',\'' + esc(id) + '\')">كاملة</button>',
        '  <button type="button" class="btn btn-light" onclick="manhajDeleteEntry(' + Number(lessonIdx) + ',\'' + esc(part) + '\',\'' + esc(id) + '\')">حذف</button>',
        '</div>'
      ].join('');
    }).join('');
  }

  function builderOverlayHtml() {
    if (!UI.draft) return '';
    syncDraftLessonsCount();
    var draft = UI.draft;

    var lessonsHtml = draft.lessons.map(function (lesson, idx) {
      return [
        '<div class="manhaj-lesson-card">',
        '  <div class="row between" style="gap:8px; flex-wrap:wrap; margin-bottom:6px;">',
        '    <h4 style="margin:0;">' + esc(lesson.title || ('الدرس ' + String(idx + 1))) + '</h4>',
        '    <span class="badge">#' + String(idx + 1) + '</span>',
        '  </div>',
        '  <div class="manhaj-sections">',
        '    <div class="manhaj-section-box">',
        '      <div class="row between" style="margin-bottom:6px;">',
        '        <b>الحفظ</b>',
        '        <button class="btn btn-light" type="button" onclick="manhajOpenPicker(' + Number(idx) + ',\'hifdh\')">+ إضافة سورة</button>',
        '      </div>',
        renderLessonEntries(idx, 'hifdh', lesson.hifdh),
        '    </div>',
        '    <div class="manhaj-section-box">',
        '      <div class="row between" style="margin-bottom:6px;">',
        '        <b>المراجعة</b>',
        '        <button class="btn btn-light" type="button" onclick="manhajOpenPicker(' + Number(idx) + ',\'revision\')">+ إضافة سورة</button>',
        '      </div>',
        renderLessonEntries(idx, 'revision', lesson.revision),
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');
    }).join('');

    var pickerHtml = UI.picker.open ? builderPickerHtml() : '';

    return [
      '<div class="manhaj-overlay" onclick="if(event.target===this) manhajCloseBuilder()">',
      '  <div class="manhaj-overlay-card">',
      '    <div class="row between" style="gap:8px; flex-wrap:wrap;">',
      '      <div>',
      '        <h3 style="margin-bottom:4px;">بناء المنهج</h3>',
      '        <p class="muted" style="font-size:12px;">صفحة مستقلة لإعداد الدروس وربطها بالحلقة.</p>',
      '      </div>',
      '      <div class="row" style="gap:6px;">',
      '        <button class="btn btn-primary" onclick="manhajSavePlan()">حفظ المنهج</button>',
      '        <button class="btn btn-light" onclick="manhajPrintDraft()">طباعة</button>',
      '        <button class="btn btn-light" onclick="manhajTogglePreview()">معاينة</button>',
      '        <button class="btn btn-light" onclick="manhajCloseBuilder()">✕</button>',
      '      </div>',
      '    </div>',
      '',
      '    <div class="manhaj-draft-grid">',
      '      <div class="field-block">',
      '        <div class="field-label">اختيار الحلقة</div>',
      '        <select onchange="manhajSetDraftField(\'halaqaId\', this.value)">' + draftHalaqaOptionsHtml() + '</select>',
      '      </div>',
      '      <div class="field-block">',
      '        <div class="field-label">اسم المنهج</div>',
      '        <input value="' + esc(draft.name || '') + '" oninput="manhajSetDraftField(\'name\', this.value)" />',
      '      </div>',
      '      <div class="field-block">',
      '        <div class="field-label">عدد الدروس المخططة</div>',
      '        <input type="text" inputmode="numeric" value="' + esc(draft.plannedLessons || 1) + '" onchange="manhajSetDraftLessonsCount(this.value)" />',
      '      </div>',
      '      <div class="field-block">',
      '        <div class="field-label">القسم</div>',
      '        <div class="badge">' + sectionLabel(draft.section) + '</div>',
      '      </div>',
      '    </div>',
      '',
      '    <div class="manhaj-lessons-wrap">' + lessonsHtml + '</div>',
      (UI.previewOpen ? '<div class="manhaj-preview-card"><h4>معاينة المنهج</h4>' + draftPreviewBodyHtml(draft) + '</div>' : ''),
      '    ' + pickerHtml,
      '  </div>',
      '</div>'
    ].join('');
  }

  function surahFilteredRows() {
    var search = String(UI.picker.search || '').trim().toLowerCase();
    var filter = String(UI.picker.filter || 'all');

    return surahListDesc().filter(function (s) {
      var n = Number(s.n || 0);
      var matchFilter = true;
      if (filter === 'amma') matchFilter = n >= 78;
      else if (filter === 'tabarak') matchFilter = n >= 67 && n <= 77;
      else if (filter === 'short') matchFilter = Number(s.a || 0) <= 10;
      if (!matchFilter) return false;
      if (!search) return true;
      var hay = (String(s.name || '') + ' ' + String(s.n || '')).toLowerCase();
      return hay.indexOf(search) !== -1;
    });
  }

  function builderPickerHtml() {
    var rows = surahFilteredRows();
    var filter = String(UI.picker.filter || 'all');
    var filters = [
      { key: 'all', label: 'الكل' },
      { key: 'amma', label: 'جزء عم' },
      { key: 'tabarak', label: 'جزء تبارك' },
      { key: 'short', label: 'قصار (١٠ فأقل)' }
    ];

    return [
      '<div class="manhaj-sidepicker-backdrop" onclick="if(event.target===this) manhajClosePicker()">',
      '  <aside class="manhaj-sidepicker">',
      '    <div class="row between" style="margin-bottom:8px;">',
      '      <b>اختيار السورة</b>',
      '      <button class="btn btn-light" onclick="manhajClosePicker()">✕</button>',
      '    </div>',
      '    <input placeholder="بحث عن سورة..." value="' + esc(UI.picker.search || '') + '" oninput="manhajSetPickerSearch(this.value)" />',
      '    <div class="manhaj-filter-row">',
      filters.map(function (f) {
        return '<button class="manhaj-filter-btn ' + (filter === f.key ? 'active' : '') + '" type="button" onclick="manhajSetPickerFilter(\'' + f.key + '\')">' + esc(f.label) + '</button>';
      }).join(''),
      '    </div>',
      '    <div class="manhaj-surah-list">',
      rows.map(function (s) {
        return '<button type="button" class="manhaj-surah-btn" onclick="manhajPickSurah(' + Number(s.n - 1) + ')">' + esc(String(s.n) + '. ' + s.name + ' (' + s.a + ')') + '</button>';
      }).join('') || '<p class="muted">لا توجد نتائج مطابقة.</p>',
      '    </div>',
      '  </aside>',
      '</div>'
    ].join('');
  }

  function draftPreviewBodyHtml(plan) {
    var p = normalizePlan(plan);
    var h = halaqaById(p.halaqaId);
    var rows = p.lessons.map(function (lesson, idx) {
      return [
        '<tr>',
        '  <td>' + String(idx + 1) + '</td>',
        '  <td>' + esc(lesson.title || ('الدرس ' + String(idx + 1))) + '</td>',
        '  <td>' + esc(lessonSummaryText(lesson)) + '</td>',
        '</tr>'
      ].join('');
    }).join('') || '<tr><td colspan="3">لا توجد دروس.</td></tr>';

    return [
      '<div class="manhaj-preview-head">',
      '  <div><b>المنهج:</b> ' + esc(p.name || '-') + '</div>',
      '  <div><b>الحلقة:</b> ' + esc(h ? h.circleName : 'غير مسندة') + '</div>',
      '  <div><b>القسم:</b> ' + sectionLabel(p.section) + '</div>',
      '  <div><b>عدد الدروس:</b> ' + Number(p.lessons.length || 0) + '</div>',
      '</div>',
      '<div class="manhaj-print-table">',
      '  <table>',
      '    <thead><tr><th>#</th><th>الدرس</th><th>التفاصيل</th></tr></thead>',
      '    <tbody>' + rows + '</tbody>',
      '  </table>',
      '</div>'
    ].join('');
  }

  function draftToSavedPlan() {
    if (!UI.draft) return null;
    syncDraftLessonsCount();
    syncDraftSectionFromHalaqa();
    var normalized = normalizePlan(UI.draft);
    normalized.updatedAt = new Date().toISOString();
    if (!normalized.createdAt) normalized.createdAt = normalized.updatedAt;
    return normalized;
  }

  function refreshSupervisionView() {
    if (typeof window.renderSupervision === 'function' && state.tab === 'supervision') {
      window.renderSupervision();
      return;
    }
    if (typeof window.renderAll === 'function') window.renderAll();
  }

  function refreshTeacherView() {
    if (typeof window.renderHalaqas === 'function') {
      window.renderHalaqas();
      return;
    }
    if (typeof window.renderAll === 'function') window.renderAll();
  }

  function manhajSetSupervisionTab(tab) {
    UI.supervisionTab = String(tab || '') === 'manhaj' ? 'manhaj' : 'supervision';
    refreshSupervisionView();
  }

  function manhajSelectProgressPlan(planId) {
    UI.selectedProgressPlanId = String(planId || '');
    UI.progressError = '';
    refreshSupervisionView();
  }

  function manhajOpenBuilder() {
    initDraft('');
    refreshSupervisionView();
  }

  function manhajEditPlan(planId) {
    initDraft(planId);
    refreshSupervisionView();
  }

  function manhajCloseBuilder() {
    UI.builderOpen = false;
    UI.previewOpen = false;
    UI.picker.open = false;
    UI.editingPlanId = '';
    UI.draft = null;
    refreshSupervisionView();
  }

  function manhajSetDraftField(field, value) {
    if (!UI.draft) return;
    if (field === 'halaqaId') {
      UI.draft.halaqaId = String(value || '');
      syncDraftSectionFromHalaqa();
    } else if (field === 'name') {
      UI.draft.name = String(value || '');
    }
    refreshSupervisionView();
  }

  function manhajSetDraftLessonsCount(value) {
    if (!UI.draft) return;
    UI.draft.plannedLessons = clampNum(toInt(value, UI.draft.plannedLessons || 1), 1, 120);
    syncDraftLessonsCount();
    refreshSupervisionView();
  }

  function manhajOpenPicker(lessonIdx, part) {
    if (!UI.draft) return;
    UI.picker.open = true;
    UI.picker.lessonIdx = clampNum(Number(lessonIdx || 0), 0, Math.max(0, UI.draft.lessons.length - 1));
    UI.picker.part = String(part || 'hifdh') === 'revision' ? 'revision' : 'hifdh';
    UI.picker.search = '';
    UI.picker.filter = 'all';
    refreshSupervisionView();
  }

  function manhajClosePicker() {
    UI.picker.open = false;
    refreshSupervisionView();
  }

  function manhajSetPickerSearch(value) {
    UI.picker.search = String(value || '');
    refreshSupervisionView();
  }

  function manhajSetPickerFilter(filter) {
    UI.picker.filter = ['all', 'amma', 'tabarak', 'short'].indexOf(String(filter)) >= 0 ? String(filter) : 'all';
    refreshSupervisionView();
  }

  function manhajPickSurah(surahIdx) {
    if (!UI.draft) return;
    var lesson = UI.draft.lessons[UI.picker.lessonIdx];
    if (!lesson) return;
    var part = UI.picker.part === 'revision' ? 'revision' : 'hifdh';
    var idx = Number(surahIdx);
    if (!Number.isFinite(idx) || idx < 0 || idx >= getSurahData().length) return;
    var maxAya = maxAyaForSurahIdx(idx);
    lesson[part].push({
      id: makeId('mrow'),
      surahIdx: idx,
      fromAya: 1,
      toAya: maxAya,
    });
    UI.picker.open = false;
    refreshSupervisionView();
  }

  function findDraftEntry(lessonIdx, part, entryId) {
    if (!UI.draft) return null;
    var lesson = UI.draft.lessons[Number(lessonIdx)];
    if (!lesson) return null;
    var arr = String(part) === 'revision' ? lesson.revision : lesson.hifdh;
    if (!Array.isArray(arr)) return null;
    for (var i = 0; i < arr.length; i += 1) {
      if (String(arr[i].id) === String(entryId)) return arr[i];
    }
    return null;
  }

  function manhajUpdateEntry(lessonIdx, part, entryId, field, value) {
    var entry = findDraftEntry(lessonIdx, part, entryId);
    if (!entry) return;
    var maxAya = maxAyaForSurahIdx(entry.surahIdx);
    if (field === 'fromAya') {
      entry.fromAya = clampNum(toInt(value, entry.fromAya || 1), 1, maxAya);
    } else if (field === 'toAya') {
      entry.toAya = clampNum(toInt(value, entry.toAya || maxAya), 1, maxAya);
    }
    refreshSupervisionView();
  }

  function manhajSetEntryComplete(lessonIdx, part, entryId) {
    var entry = findDraftEntry(lessonIdx, part, entryId);
    if (!entry) return;
    var maxAya = maxAyaForSurahIdx(entry.surahIdx);
    entry.fromAya = 1;
    entry.toAya = maxAya;
    refreshSupervisionView();
  }

  function manhajDeleteEntry(lessonIdx, part, entryId) {
    if (!UI.draft) return;
    var lesson = UI.draft.lessons[Number(lessonIdx)];
    if (!lesson) return;
    var arr = String(part) === 'revision' ? lesson.revision : lesson.hifdh;
    lesson[String(part) === 'revision' ? 'revision' : 'hifdh'] = (arr || []).filter(function (row) {
      return String(row.id) !== String(entryId);
    });
    refreshSupervisionView();
  }

  function manhajSavePlan() {
    var plan = draftToSavedPlan();
    if (!plan) return;
    if (!String(plan.name || '').trim()) {
      if (typeof window.toast === 'function') window.toast('اكتب اسم المنهج', 'err');
      return;
    }
    if (!String(plan.halaqaId || '').trim()) {
      if (typeof window.toast === 'function') window.toast('اختر الحلقة أولاً', 'err');
      return;
    }

    var plans = getPlans().map(normalizePlan);
    var idx = -1;
    for (var i = 0; i < plans.length; i += 1) {
      if (String(plans[i].id) === String(UI.editingPlanId || plan.id)) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) plans[idx] = plan;
    else plans.unshift(plan);

    ensureStore().plans = plans;
    UI.progressRowsByPlan = {};
    UI.progressError = '';
    saveAddon();

    UI.editingPlanId = plan.id;
    UI.builderOpen = false;
    UI.previewOpen = false;
    UI.picker.open = false;
    UI.draft = null;

    if (typeof window.toast === 'function') window.toast('تم حفظ المنهج بنجاح');
    refreshSupervisionView();
    refreshTeacherView();
    if (typeof window.renderParentView === 'function') window.renderParentView();
  }

  function manhajTogglePreview() {
    if (!UI.draft) return;
    UI.previewOpen = !UI.previewOpen;
    refreshSupervisionView();
  }

  function manhajPrintDraft() {
    var draft = draftToSavedPlan();
    if (!draft) return;
    var w = window.open('', '_blank');
    if (!w) {
      if (typeof window.toast === 'function') window.toast('اسمح بفتح نافذة الطباعة', 'err');
      return;
    }
    var title = 'منهج - ' + (draft.name || '-');
    w.document.write(
      '<html lang="ar" dir="rtl"><head><meta charset="utf-8" />'
      + '<title>' + esc(title) + '</title>'
      + '<style>'
      + 'body{font-family:Tajawal,Arial,sans-serif;padding:18px;color:#0f172a}'
      + 'h2{margin:0 0 8px 0;color:#166534}'
      + '.meta{margin-bottom:10px;color:#64748b;font-size:13px}'
      + 'table{width:100%;border-collapse:collapse;margin-top:10px}'
      + 'th,td{border:1px solid #e2e8f0;padding:8px;text-align:right;font-size:13px;vertical-align:top}'
      + 'th{background:#f8fafc}'
      + '</style></head><body>'
      + '<h2>' + esc(draft.name || 'المنهج') + '</h2>'
      + '<div class="meta">تاريخ الطباعة: ' + esc(today()) + '</div>'
      + draftPreviewBodyHtml(draft)
      + '</body></html>'
    );
    w.document.close();
    setTimeout(function () { w.print(); }, 260);
  }

  function teacherTodaySessionKey(halaqaId) {
    return String(halaqaId || '') + '__' + today();
  }

  function teacherEnsureDraftExists(ctx) {
    if (!ctx || !ctx.flow || !ctx.student || !ctx.halaqa) return null;
    if (!ctx.flow.sessions || typeof ctx.flow.sessions !== 'object') ctx.flow.sessions = {};
    var key = teacherTodaySessionKey(ctx.halaqa.id);
    if (!ctx.flow.sessions[key] || typeof ctx.flow.sessions[key] !== 'object') ctx.flow.sessions[key] = { students: {} };
    if (!ctx.flow.sessions[key].students || typeof ctx.flow.sessions[key].students !== 'object') {
      ctx.flow.sessions[key].students = {};
    }
    if (!ctx.flow.sessions[key].students[ctx.student.id]) {
      ctx.flow.sessions[key].students[ctx.student.id] = {
        attendance: '',
        hifdhEntries: [{ id: makeId('trow'), surahIdx: '', fromAya: 1, toAya: 1, grade: '1' }],
        revisionEntries: [{ id: makeId('trow'), surahIdx: '', fromAya: 1, toAya: 1, grade: '1' }],
        note: '',
      };
    }
    ctx.draft = ctx.flow.sessions[key].students[ctx.student.id];
    return ctx.draft;
  }

  function teacherEvalContext() {
    if (!isTeacherUser() || !state.teacherFlow || String(state.teacherFlow.view || '') !== 'evaluate') return null;
    var flow = state.teacherFlow;
    var halaqa = halaqaById(flow.activeHalaqaId);
    if (!halaqa) return null;
    var students = sortedStudentsForHalaqa(halaqa.id);
    if (!students.length) return null;
    var idx = clampNum(Number(flow.studentIndex || 0), 0, students.length - 1);
    var student = students[idx];
    var ctx = { flow: flow, halaqa: halaqa, students: students, student: student, index: idx, draft: null };
    teacherEnsureDraftExists(ctx);
    return ctx;
  }

  function mapLessonEntryToDraftRow(entry, fallbackId) {
    var row = normalizeEntry(entry || {});
    return {
      id: String((entry && entry.id) || fallbackId || makeId('trow')),
      surahIdx: Number(row.surahIdx),
      fromAya: Number(row.fromAya),
      toAya: Number(row.toAya),
      grade: '1',
    };
  }

  function applyLessonTemplateToDraft(ctx, plan, lessonNumber) {
    if (!ctx || !ctx.draft) return false;
    var p = normalizePlan(plan || {});
    var lessonNo = normalizeLessonNumberForPlan(p, lessonNumber);
    var lesson = lessonRowForPlan(p, lessonNo);
    if (!lesson) return false;
    var marker = String(p.id || '') + ':' + String(lessonNo);
    if (String(ctx.draft.__manhajLessonMarker || '') === marker) return false;

    var hRows = (Array.isArray(lesson.hifdh) ? lesson.hifdh : []).map(function (row, idx) {
      return mapLessonEntryToDraftRow(row, makeId('mh' + idx));
    });
    var rRows = (Array.isArray(lesson.revision) ? lesson.revision : []).map(function (row, idx) {
      return mapLessonEntryToDraftRow(row, makeId('mr' + idx));
    });

    ctx.draft.hifdhEntries = hRows.length ? hRows : [{ id: makeId('trow'), surahIdx: '', fromAya: 1, toAya: 1, grade: '1' }];
    ctx.draft.revisionEntries = rRows.length ? rRows : [{ id: makeId('trow'), surahIdx: '', fromAya: 1, toAya: 1, grade: '1' }];
    ctx.draft.__manhajLessonMarker = marker;
    return true;
  }

  function rangeOverlap(aFrom, aTo, bFrom, bTo) {
    var left = Math.max(Number(aFrom || 0), Number(bFrom || 0));
    var right = Math.min(Number(aTo || 0), Number(bTo || 0));
    if (right < left) return 0;
    return right - left + 1;
  }

  function requirementStatus(requiredEntry, actualRows) {
    var req = normalizeEntry(requiredEntry || {});
    var rows = Array.isArray(actualRows) ? actualRows : [];
    var best = { full: false, partial: false };
    rows.forEach(function (row) {
      var parsed = normalizeEntry(row || {});
      if (Number(parsed.surahIdx) !== Number(req.surahIdx)) return;
      if (parsed.fromAya <= req.fromAya && parsed.toAya >= req.toAya) best.full = true;
      if (rangeOverlap(parsed.fromAya, parsed.toAya, req.fromAya, req.toAya) > 0) best.partial = true;
    });
    if (best.full) return { cls: 'done', label: 'أتم المطلوب' };
    if (best.partial) return { cls: 'partial', label: 'حفظ جزءاً' };
    return { cls: 'none', label: 'لم يحفظ' };
  }

  function buildRequirementItems(partRows, actualRows) {
    var rows = Array.isArray(partRows) ? partRows : [];
    return rows.map(function (entry) {
      var parsed = normalizeEntry(entry || {});
      var status = requirementStatus(parsed, actualRows);
      return '<div class="manhaj-req-item ' + status.cls + '">' + esc(lessonEntryText(parsed)) + ' <span>• ' + esc(status.label) + '</span></div>';
    }).join('') || '<div class="manhaj-req-item none">لا يوجد مطلوب</div>';
  }

  function renderTeacherLessonBannerAndIndicators(cardsRoot, ctx, plan, lessonNumber) {
    if (!cardsRoot || !ctx || !plan) return;
    Array.prototype.slice.call(cardsRoot.querySelectorAll('.manhaj-student-banner,.manhaj-req-box,.manhaj-action-row')).forEach(function (el) { el.remove(); });

    var lesson = lessonRowForPlan(plan, lessonNumber);
    if (!lesson) return;

    var anchor = cardsRoot.querySelector('.tw-student-name');
    if (anchor && anchor.parentElement) {
      var banner = document.createElement('div');
      banner.className = 'manhaj-student-banner';
      banner.innerHTML = '<b>درس ' + Number(lessonNumber) + '</b> — الحفظ: ' + esc(lessonPartText(lesson, 'hifdh')) + ' — المراجعة: ' + esc(lessonPartText(lesson, 'revision'));
      anchor.parentElement.insertBefore(banner, anchor);
    }

    var sections = cardsRoot.querySelectorAll('.tw-entry-section');
    var hifdhSection = sections[0] || null;
    var revisionSection = sections[1] || null;
    var draft = ctx.draft || {};
    if (hifdhSection) {
      var box1 = document.createElement('div');
      box1.className = 'manhaj-req-box';
      box1.innerHTML = '<div class="manhaj-req-title">مطلوب المنهج (الحفظ)</div>' + buildRequirementItems(lesson.hifdh, draft.hifdhEntries);
      hifdhSection.insertBefore(box1, hifdhSection.firstChild.nextSibling || null);
    }
    if (revisionSection) {
      var box2 = document.createElement('div');
      box2.className = 'manhaj-req-box';
      box2.innerHTML = '<div class="manhaj-req-title">مطلوب المنهج (المراجعة)</div>' + buildRequirementItems(lesson.revision, draft.revisionEntries);
      revisionSection.insertBefore(box2, revisionSection.firstChild.nextSibling || null);
    }

    var actionWrap = cardsRoot.querySelector('.tw-actions');
    if (actionWrap) {
      var saveNextBtn = actionWrap.querySelector('.btn.btn-primary');
      if (saveNextBtn) saveNextBtn.style.display = 'none';
      var row = document.createElement('div');
      row.className = 'manhaj-action-row';
      row.innerHTML = '' +
        '<button type="button" class="btn btn-ok" onclick="manhajTeacherCompleteLesson()">أتم الدرس ✓</button>' +
        '<button type="button" class="btn btn-primary" onclick="manhajTeacherSaveIncomplete()">لم يكمل ←</button>';
      actionWrap.appendChild(row);
    }
  }

  function renderTeacherManhajTab() {
    var halaqas = visibleHalaqaList();
    if (!halaqas.length) return '<div class="tw-card">لا توجد حلقات مخصصة للمعلم.</div>';

    if (!UI.teacherHalaqaId || !halaqaById(UI.teacherHalaqaId)) {
      UI.teacherHalaqaId = String(halaqas[0].id || '');
    }

    var selectedHalaqaId = String(UI.teacherHalaqaId || '');
    var selectedHalaqa = halaqaById(selectedHalaqaId);
    var plan = selectedHalaqa ? planForHalaqa(selectedHalaqa.id) : null;

    var halaqaOptions = halaqas.map(function (h) {
      var selected = String(h.id) === selectedHalaqaId;
      return '<option value="' + esc(h.id) + '" ' + (selected ? 'selected' : '') + '>' + esc(h.circleName || '-') + '</option>';
    }).join('');

    if (!plan) {
      return [
        '<div class="tw-card">',
        '  <div class="tw-head"><h3>تبويب المنهج</h3><span class="tw-pill">عرض فقط</span></div>',
        '  <div class="field-block" style="margin-top:8px;">',
        '    <div class="field-label">الحلقة</div>',
        '    <select onchange="manhajSetTeacherHalaqa(this.value)">' + halaqaOptions + '</select>',
        '  </div>',
        '  <p class="muted" style="margin-top:10px;">لا يوجد منهج مسند لهذه الحلقة حتى الآن. يمكن للإدارة/الإشراف إضافته من تبويب المناهج.</p>',
        '</div>'
      ].join('');
    }

    var students = sortedStudentsForHalaqa(selectedHalaqa.id);
    var rows = students.map(function (student, idx) {
      var prog = progressForStudentInPlan(plan, student.id);
      return [
        '<tr>',
        '  <td>' + String(idx + 1) + '</td>',
        '  <td>' + esc(student.name || '-') + '</td>',
        '  <td>' + esc(prog.currentLessonLabel) + '</td>',
        '  <td>',
        '    <div class="manhaj-mini-progress"><span style="width:' + Number(prog.percent) + '%"></span></div>',
        '    <div style="margin-top:4px; font-size:12px;">' + Number(prog.percent) + '%</div>',
        '  </td>',
        '  <td>' + Number(prog.completedLessons) + '/' + Number(prog.totalLessons) + '</td>',
        '</tr>'
      ].join('');
    }).join('') || '<tr><td colspan="5" class="muted">لا يوجد طلاب في الحلقة.</td></tr>';

    return [
      '<div class="tw-card">',
      '  <div class="tw-head">',
      '    <div>',
      '      <h3>المنهج</h3>',
      '      <p>متابعة تقدم الطلاب على المنهج المعتمد للحلقة</p>',
      '    </div>',
      '    <span class="tw-pill">' + esc(plan.name || '-') + '</span>',
      '  </div>',
      '  <div class="field-block" style="margin-top:8px;">',
      '    <div class="field-label">الحلقة</div>',
      '    <select onchange="manhajSetTeacherHalaqa(this.value)">' + halaqaOptions + '</select>',
      '  </div>',
      '  <div class="tw-table-wrap" style="margin-top:10px;">',
      '    <table class="tw-summary-table">',
      '      <thead><tr><th>#</th><th>الطالب</th><th>الدرس الحالي</th><th>التقدم</th><th>المكتمل</th></tr></thead>',
      '      <tbody>' + rows + '</tbody>',
      '    </table>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function injectTeacherBanner(cardsRoot) {
    if (!cardsRoot) return;
    Array.prototype.slice.call(cardsRoot.querySelectorAll('.manhaj-student-banner,.manhaj-req-box,.manhaj-action-row')).forEach(function (el) { el.remove(); });
    var mainSaveBtn = cardsRoot.querySelector('.tw-actions .btn.btn-primary');
    if (mainSaveBtn) mainSaveBtn.style.display = '';

    if (UI.teacherTab === 'manhaj') return;
    if (!state.teacherFlow || String(state.teacherFlow.view || '') !== 'evaluate') return;

    var ctx = teacherEvalContext();
    if (!ctx || !ctx.halaqa || !ctx.student) return;
    var plan = planForHalaqa(ctx.halaqa.id);
    if (!plan) return;
    var expectedStudentId = String(ctx.student.id || '');
    var expectedHalaqaId = String(ctx.halaqa.id || '');
    var expectedIndex = Number(ctx.index || 0);

    readCurrentLessonFromFirebase(ctx.student.id, { fresh: false }).then(function (lessonNumber) {
      var live = teacherEvalContext();
      if (!live || !live.student || !live.halaqa) return;
      if (String(live.student.id || '') !== expectedStudentId) return;
      if (String(live.halaqa.id || '') !== expectedHalaqaId) return;
      if (Number(live.index || 0) !== expectedIndex) return;

      var currentLesson = normalizeLessonNumberForPlan(plan, lessonNumber);
      var changed = applyLessonTemplateToDraft(live, plan, currentLesson);
      if (changed) {
        queueTeacherRefresh();
        return;
      }
      renderTeacherLessonBannerAndIndicators(cardsRoot, live, plan, currentLesson);
    });
  }

  async function manhajTeacherSaveIncomplete() {
    UI.teacherPendingAction = 'incomplete';
    if (typeof window.teacherSaveAndNext === 'function') await window.teacherSaveAndNext();
  }

  async function manhajTeacherCompleteLesson() {
    UI.teacherPendingAction = 'complete';
    if (typeof window.teacherSaveAndNext === 'function') await window.teacherSaveAndNext();
  }

  function patchTeacherSaveAndNextAction() {
    var original = window.teacherSaveAndNext;
    if (typeof original !== 'function') return;
    if (original.__manhajActionWrapped) return;

    var wrapped = async function manhajSaveAndNextWrapper() {
      var action = String(UI.teacherPendingAction || 'normal');
      UI.teacherPendingAction = 'normal';
      var before = teacherEvalContext();
      var beforeIndex = before ? Number(before.flow.studentIndex || 0) : -1;
      var beforeView = before ? String(before.flow.view || '') : '';
      var beforeHalaqa = before ? String(before.halaqa.id || '') : '';

      await original.apply(this, arguments);

      if (action !== 'complete' || !before || !before.student) return;
      var flow = state.teacherFlow || {};
      var moved = String(flow.view || '') !== beforeView
        || Number(flow.studentIndex || 0) !== beforeIndex
        || String(flow.activeHalaqaId || '') !== beforeHalaqa;
      if (!moved) return;

      var current = await readCurrentLessonFromFirebase(before.student.id, { fresh: true });
      var ok = await writeCurrentLessonToFirebase(before.student.id, Number(current || 1) + 1);
      if (!ok && typeof window.toast === 'function') {
        window.toast('تم حفظ التقييم لكن تعذر تحديث رقم الدرس في Firebase', 'err');
      }
    };
    wrapped.__manhajActionWrapped = true;
    wrapped.__manhajActionOriginal = original;
    window.teacherSaveAndNext = wrapped;
  }

  function ensureTeacherNavButton(cardsRoot) {
    var nav = cardsRoot.querySelector('.tw-bottom-nav');
    if (!nav) return null;
    nav.style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))';

    if (!nav.dataset.manhajHooked) {
      nav.dataset.manhajHooked = '1';
      nav.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('.tw-nav-btn') : null;
        if (!btn) return;
        if (btn.dataset && btn.dataset.twAddon === 'manhaj') return;
        UI.teacherTab = 'halaqas';
      });
    }

    var btn = nav.querySelector('[data-tw-addon="manhaj"]');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tw-nav-btn';
      btn.dataset.twAddon = 'manhaj';
      btn.textContent = 'المنهج';
      btn.onclick = function () {
        UI.teacherTab = 'manhaj';
        if (!UI.teacherHalaqaId) {
          var list = visibleHalaqaList();
          UI.teacherHalaqaId = list[0] ? String(list[0].id || '') : '';
        }
        refreshTeacherView();
      };
      nav.appendChild(btn);
    }

    return btn;
  }

  function renderTeacherAddon() {
    if (!isTeacherUser()) return;
    var cardsRoot = document.getElementById('halaqaCards');
    if (!cardsRoot) return;
    var shell = cardsRoot.querySelector('.tw-shell');
    if (!shell) return;

    var navBtn = ensureTeacherNavButton(cardsRoot);
    if (UI.teacherTab === 'manhaj') {
      var nav = cardsRoot.querySelector('.tw-bottom-nav');
      if (nav) {
        Array.prototype.slice.call(nav.querySelectorAll('.tw-nav-btn')).forEach(function (b) {
          b.classList.remove('active');
        });
      }
      if (navBtn) navBtn.classList.add('active');
      shell.innerHTML = renderTeacherManhajTab();
    } else if (navBtn) {
      navBtn.classList.remove('active');
      injectTeacherBanner(cardsRoot);
    }
  }

  function manhajSetTeacherHalaqa(halaqaId) {
    UI.teacherHalaqaId = String(halaqaId || '');
    if (UI.teacherTab !== 'manhaj') UI.teacherTab = 'manhaj';
    refreshTeacherView();
  }

  function renderParentManhajSection() {
    if (!state.session || state.session.type !== 'parent') return;
    var report = document.getElementById('parentStudentReport');
    if (!report) return;

    var old = report.querySelector('#manhajParentSection');
    if (old) old.remove();

    var kids = (state.indexes && state.indexes.parentStudentsByPhone && state.indexes.parentStudentsByPhone[state.session.guardianPhone]) || [];
    var selected = null;
    for (var i = 0; i < kids.length; i += 1) {
      if (String(kids[i].id) === String(state.currentParentStudentId || '')) {
        selected = kids[i];
        break;
      }
    }
    if (!selected) selected = kids[0] || null;
    if (!selected) return;

    var plan = planForHalaqa(selected.halaqaId);
    if (!plan) return;

    var progress = progressForStudentInPlan(plan, selected.id);
    var lessonRows = progress.lessonStats.map(function (row, idx) {
      var statusClass = row.stats.complete ? 'ok' : (row.stats.covered > 0 ? 'progress' : 'pending');
      var gradeText = row.stats.gradeAvg == null ? '—' : String(row.stats.gradeAvg) + '/10';
      return [
        '<div class="manhaj-parent-lesson ' + statusClass + '">',
        '  <div class="row between" style="gap:8px; flex-wrap:wrap;">',
        '    <b>' + esc(row.lesson.title || ('الدرس ' + String(idx + 1))) + '</b>',
        '    <span class="badge">' + esc(row.stats.status) + '</span>',
        '  </div>',
        '  <div class="muted" style="font-size:12px; margin-top:4px;">' + esc(lessonSummaryText(row.lesson)) + '</div>',
        '  <div class="row between" style="margin-top:6px;">',
        '    <span>التقدير: <b>' + esc(gradeText) + '</b></span>',
        '    <span>الإنجاز: <b>' + Number(row.stats.percent) + '%</b></span>',
        '  </div>',
        '</div>'
      ].join('');
    }).join('') || '<p class="muted">لا توجد دروس معرفة في المنهج.</p>';

    var section = document.createElement('div');
    section.id = 'manhajParentSection';
    section.className = 'card';
    section.innerHTML = [
      '<div class="row between" style="gap:8px; flex-wrap:wrap;">',
      '  <h3 style="margin:0;">منهج الطالب</h3>',
      '  <span class="badge">' + esc(plan.name || 'المنهج') + '</span>',
      '</div>',
      '<div class="manhaj-parent-head">',
      '  <div class="manhaj-parent-circle" style="--p:' + Number(progress.percent) + ';">',
      '    <span>' + Number(progress.percent) + '%</span>',
      '  </div>',
      '  <div>',
      '    <p class="muted" style="margin:0; font-size:12px;">الدروس المكتملة</p>',
      '    <b style="font-size:24px; color:#14532d;">' + Number(progress.completedLessons) + ' / ' + Number(progress.totalLessons) + '</b>',
      '    <p class="muted" style="margin-top:4px;">الدرس الحالي: <b>' + esc(progress.currentLessonLabel) + '</b></p>',
      '  </div>',
      '</div>',
      '<div class="manhaj-parent-lessons">' + lessonRows + '</div>'
    ].join('');

    report.appendChild(section);
  }

  function wrapFunction(name, after) {
    var original = window[name];
    if (typeof original !== 'function') return;
    if (original.__manhajWrapped) return;

    var wrapped = function wrappedByManhajAddon() {
      var result = original.apply(this, arguments);
      try { after(); } catch (err) { console.error('Manhaj addon hook error @' + name, err); }
      return result;
    };
    wrapped.__manhajWrapped = true;
    wrapped.__manhajOriginal = original;
    window[name] = wrapped;
  }

  function injectStyles() {
    if (document.getElementById('manhajAddonStyles')) return;
    var style = document.createElement('style');
    style.id = 'manhajAddonStyles';
    style.textContent = [
      '.manhaj-hidden{display:none !important;}',
      '.manhaj-super-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;}',
      '.manhaj-super-tab{border:1px solid #d1d5db;border-radius:10px;background:#fff;padding:7px 12px;cursor:pointer;font-family:inherit;font-weight:800;color:#334155;}',
      '.manhaj-super-tab.active{border-color:#166534;background:#dcfce7;color:#166534;}',
      '.manhaj-plan-list{display:grid;gap:8px;}',
      '.manhaj-plan-row{border:1px solid #e2e8f0;border-radius:12px;padding:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;background:#fff;}',
      '.manhaj-plan-title{font-weight:900;color:#14532d;}',
      '.manhaj-plan-meta{font-size:12px;color:#64748b;margin-top:4px;}',
      '.manhaj-progress-table-wrap{border:1px solid #e2e8f0;border-radius:12px;overflow:auto;background:#fff;}',
      '.manhaj-progress-table{width:100%;border-collapse:collapse;min-width:760px;}',
      '.manhaj-progress-table th,.manhaj-progress-table td{border-top:1px solid #e2e8f0;padding:8px;text-align:right;font-size:13px;vertical-align:middle;}',
      '.manhaj-progress-table thead th{border-top:0;background:#f8fafc;color:#334155;font-weight:800;}',
      '.manhaj-status-pill{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:800;}',
      '.manhaj-status-pill.ok{background:#dcfce7;color:#166534;}',
      '.manhaj-status-pill.warn{background:#fef9c3;color:#854d0e;}',
      '.manhaj-status-pill.late{background:#fee2e2;color:#991b1b;}',
      '.manhaj-overlay{position:fixed;inset:0;z-index:120;background:rgba(2,6,23,.56);padding:18px;overflow:auto;}',
      '.manhaj-overlay-card{max-width:1200px;margin:0 auto;background:#fff;border-radius:14px;border:1px solid #dbe7db;padding:12px;position:relative;}',
      '.manhaj-draft-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px;}',
      '.manhaj-lessons-wrap{display:grid;gap:10px;margin-top:12px;}',
      '.manhaj-lesson-card{border:1px solid #dbe7db;border-radius:12px;padding:10px;background:#f8fff9;}',
      '.manhaj-sections{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}',
      '.manhaj-section-box{border:1px solid #e2e8f0;border-radius:10px;padding:8px;background:#fff;}',
      '.manhaj-entry-row{border:1px dashed #cbd5e1;border-radius:10px;padding:8px;display:grid;grid-template-columns:minmax(0,1.4fr) repeat(2,minmax(90px,.7fr)) auto auto auto;gap:6px;align-items:center;margin-bottom:6px;}',
      '.manhaj-entry-title{font-weight:800;color:#14532d;font-size:13px;}',
      '.manhaj-entry-row label{display:grid;gap:4px;font-size:12px;color:#334155;}',
      '.manhaj-sidepicker-backdrop{position:fixed;inset:0;z-index:140;background:rgba(2,6,23,.4);display:flex;justify-content:flex-end;}',
      '.manhaj-sidepicker{width:min(420px,100%);height:100%;background:#fff;padding:12px;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;gap:8px;}',
      '.manhaj-filter-row{display:flex;gap:6px;flex-wrap:wrap;}',
      '.manhaj-filter-btn{border:1px solid #d1d5db;border-radius:999px;background:#fff;padding:5px 10px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;}',
      '.manhaj-filter-btn.active{border-color:#16a34a;background:#dcfce7;color:#166534;}',
      '.manhaj-surah-list{overflow:auto;display:grid;gap:6px;padding-bottom:8px;}',
      '.manhaj-surah-btn{text-align:right;border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:8px;cursor:pointer;font-family:inherit;font-weight:700;color:#334155;}',
      '.manhaj-surah-btn:hover{background:#f8fafc;}',
      '.manhaj-preview-card{margin-top:12px;border:1px solid #e2e8f0;border-radius:12px;padding:10px;background:#fff;}',
      '.manhaj-preview-head{display:grid;gap:4px;font-size:13px;color:#334155;margin-bottom:8px;}',
      '.manhaj-print-table{overflow:auto;}',
      '.manhaj-print-table table{width:100%;border-collapse:collapse;}',
      '.manhaj-print-table th,.manhaj-print-table td{border:1px solid #e2e8f0;padding:8px;text-align:right;font-size:13px;vertical-align:top;}',
      '.manhaj-print-table thead th{background:#f8fafc;}',
      '.manhaj-mini-progress{height:8px;border-radius:999px;background:#e2e8f0;overflow:hidden;}',
      '.manhaj-mini-progress span{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#16a34a);}',
      '.manhaj-student-banner{margin-bottom:8px;border:1px solid #86efac;background:#f0fdf4;border-radius:10px;padding:8px;color:#166534;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;}',
      '.manhaj-req-box{margin-top:6px;margin-bottom:8px;border:1px dashed #d1d5db;border-radius:10px;padding:8px;background:#f8fafc;}',
      '.manhaj-req-title{font-size:12px;font-weight:800;color:#334155;margin-bottom:6px;}',
      '.manhaj-req-item{font-size:12px;padding:4px 6px;border-radius:8px;background:#e2e8f0;color:#334155;display:flex;justify-content:space-between;gap:6px;margin-bottom:4px;}',
      '.manhaj-req-item.done{background:#dcfce7;color:#166534;}',
      '.manhaj-req-item.partial{background:#fef9c3;color:#854d0e;}',
      '.manhaj-req-item.none{background:#f1f5f9;color:#64748b;}',
      '.manhaj-action-row{display:flex;gap:8px;flex-wrap:wrap;flex:1 1 240px;}',
      '.manhaj-action-row .btn{flex:1 1 160px;}',
      '.manhaj-parent-head{display:flex;align-items:center;gap:12px;margin-top:10px;}',
      '.manhaj-parent-circle{--p:0;width:96px;height:96px;border-radius:999px;background:conic-gradient(#16a34a calc(var(--p) * 1%), #e2e8f0 0);display:grid;place-items:center;}',
      '.manhaj-parent-circle span{width:74px;height:74px;border-radius:999px;background:#fff;display:grid;place-items:center;font-weight:900;color:#14532d;}',
      '.manhaj-parent-lessons{display:grid;gap:8px;margin-top:10px;}',
      '.manhaj-parent-lesson{border:1px solid #e2e8f0;border-radius:10px;padding:8px;background:#fff;}',
      '.manhaj-parent-lesson.ok{border-color:#86efac;background:#f0fdf4;}',
      '.manhaj-parent-lesson.progress{border-color:#fde68a;background:#fffbeb;}',
      '.manhaj-parent-lesson.pending{border-color:#e2e8f0;background:#f8fafc;}',
      '@media (max-width: 980px){',
      '  .manhaj-draft-grid{grid-template-columns:1fr 1fr;}',
      '  .manhaj-sections{grid-template-columns:1fr;}',
      '  .manhaj-entry-row{grid-template-columns:1fr 1fr;}',
      '  .manhaj-parent-head{flex-direction:column;align-items:flex-start;}',
      '}',
      '@media (max-width: 640px){',
      '  .manhaj-draft-grid{grid-template-columns:1fr;}',
      '  .manhaj-overlay{padding:10px;}',
      '}'
    ].join('');
    document.head.appendChild(style);
  }

  function exposeApi() {
    window.manhajSetSupervisionTab = manhajSetSupervisionTab;
    window.manhajSelectProgressPlan = manhajSelectProgressPlan;
    window.manhajOpenBuilder = manhajOpenBuilder;
    window.manhajEditPlan = manhajEditPlan;
    window.manhajCloseBuilder = manhajCloseBuilder;
    window.manhajSetDraftField = manhajSetDraftField;
    window.manhajSetDraftLessonsCount = manhajSetDraftLessonsCount;
    window.manhajOpenPicker = manhajOpenPicker;
    window.manhajClosePicker = manhajClosePicker;
    window.manhajSetPickerSearch = manhajSetPickerSearch;
    window.manhajSetPickerFilter = manhajSetPickerFilter;
    window.manhajPickSurah = manhajPickSurah;
    window.manhajUpdateEntry = manhajUpdateEntry;
    window.manhajSetEntryComplete = manhajSetEntryComplete;
    window.manhajDeleteEntry = manhajDeleteEntry;
    window.manhajSavePlan = manhajSavePlan;
    window.manhajTogglePreview = manhajTogglePreview;
    window.manhajPrintDraft = manhajPrintDraft;
    window.manhajSetTeacherHalaqa = manhajSetTeacherHalaqa;
    window.manhajTeacherSaveIncomplete = manhajTeacherSaveIncomplete;
    window.manhajTeacherCompleteLesson = manhajTeacherCompleteLesson;
  }

  function init() {
    if (!hasRuntime()) return;
    ensureStore();
    injectStyles();
    exposeApi();
    patchTeacherSaveAndNextAction();

    wrapFunction('renderSupervision', renderSupervisionAddon);
    wrapFunction('renderHalaqas', renderTeacherAddon);
    wrapFunction('renderParentView', renderParentManhajSection);

    try {
      if (typeof window.renderSupervision === 'function' && state.tab === 'supervision') renderSupervisionAddon();
    } catch (_e) {}
    try {
      if (isTeacherUser()) renderTeacherAddon();
    } catch (_e2) {}
    try {
      if (state.session && state.session.type === 'parent') renderParentManhajSection();
    } catch (_e3) {}
  }

  init();
})();
