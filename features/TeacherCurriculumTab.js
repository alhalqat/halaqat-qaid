(function TeacherCurriculumTabModule() {
  'use strict';

  var CURRICULUM_ATTENDANCE = [
    { key: 'present', label: 'حاضر ✅' },
    { key: 'absent', label: 'غائب ❌' },
    { key: 'excused', label: 'مستأذن 🤝' },
    { key: 'remote', label: 'عن بُعد 📱' },
    { key: 'dropped', label: 'منقطع ⚠️' }
  ];

  function hasRuntime() {
    return typeof window !== 'undefined' && typeof state === 'object' && !!state;
  }

  function esc(v) {
    if (typeof window.escapeAttr === 'function') return window.escapeAttr(String(v == null ? '' : v));
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toEnglishDigits(value) {
    if (typeof window.toEnglishDigits === 'function') return window.toEnglishDigits(String(value == null ? '' : value));
    return String(value == null ? '' : value)
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
      .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); });
  }

  function toInt(value, fallback) {
    var raw = toEnglishDigits(value).replace(/[^\d]/g, '');
    if (!raw) return Number(fallback || 0);
    var n = Number(raw);
    return Number.isFinite(n) ? n : Number(fallback || 0);
  }

  function clamp(value, min, max) {
    var n = Number(value || 0);
    if (!Number.isFinite(n)) n = Number(min || 0);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function todayISODate() {
    if (typeof window.todayISO === 'function') return window.todayISO();
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function normalizeAttendance(value) {
    var key = String(value == null ? '' : value).trim();
    for (var i = 0; i < CURRICULUM_ATTENDANCE.length; i += 1) {
      if (CURRICULUM_ATTENDANCE[i].key === key) return key;
    }
    return '';
  }

  function listFromUnknown(raw) {
    if (Array.isArray(raw)) return raw.slice();
    if (!raw || typeof raw !== 'object') return [];
    return Object.keys(raw)
      .sort(function (a, b) {
        var an = Number(a);
        var bn = Number(b);
        var aNum = Number.isFinite(an);
        var bNum = Number.isFinite(bn);
        if (aNum && bNum) return an - bn;
        if (aNum) return -1;
        if (bNum) return 1;
        return String(a).localeCompare(String(b), 'ar');
      })
      .map(function (k) { return raw[k]; })
      .filter(function (v) { return v != null; });
  }

  function getSurahData() {
    if (typeof SURAH_DATA !== 'undefined' && Array.isArray(SURAH_DATA)) return SURAH_DATA;
    if (Array.isArray(window.SURAH_DATA)) return window.SURAH_DATA;
    return [];
  }

  function normalizeArabicText(value) {
    return String(value == null ? '' : value)
      .trim()
      .replace(/[ًٌٍَُِّْـ]/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function findSurahIdxByName(name) {
    var target = normalizeArabicText(name);
    if (!target) return -1;
    var data = getSurahData();
    for (var i = 0; i < data.length; i += 1) {
      if (normalizeArabicText(data[i] && data[i].name) === target) return i;
    }
    return -1;
  }

  function resolveSurahIdx(raw) {
    var dataLen = getSurahData().length;
    if (!dataLen) return 0;
    var base = raw && typeof raw === 'object' ? raw : {};

    var byName = findSurahIdxByName(base.surahName || base.name || base.surah_title || '');
    if (byName >= 0) return byName;

    var numberFields = [base.surahNumber, base.surahNo, base.surahN, base.surahNum];
    for (var i = 0; i < numberFields.length; i += 1) {
      var nNum = Number(numberFields[i]);
      if (Number.isFinite(nNum) && nNum >= 1 && nNum <= dataLen) return Math.floor(nNum) - 1;
    }

    var idxFields = [base.surahIdx, base.surahIndex, base.surahId, base.surah_id, base.surah];
    for (var j = 0; j < idxFields.length; j += 1) {
      var n = Number(idxFields[j]);
      if (!Number.isFinite(n)) continue;
      if (n >= 0 && n < dataLen) return Math.floor(n);
      if (n >= 1 && n <= dataLen) return Math.floor(n) - 1;
    }

    return 0;
  }

  function surahByIdx(idx) {
    var data = getSurahData();
    var n = Number(idx);
    if (!Number.isFinite(n) || n < 0 || n >= data.length) return null;
    return data[n] || null;
  }

  function maxAyaForSurahIdx(idx) {
    var s = surahByIdx(idx);
    return Number(s && s.a ? s.a : 1);
  }

  function normalizeEntry(raw) {
    var base = raw && typeof raw === 'object' ? raw : {};
    var surahIdx = resolveSurahIdx(base);
    var maxAya = maxAyaForSurahIdx(surahIdx);
    var fromRaw = base.fromAya != null ? base.fromAya : (base.from != null ? base.from : (base.startAya != null ? base.startAya : base.start));
    var toRaw = base.toAya != null ? base.toAya : (base.to != null ? base.to : (base.endAya != null ? base.endAya : base.end));
    var gradeRaw = base.grade != null ? base.grade : 1;
    return {
      surahIdx: surahIdx,
      fromAya: clamp(toInt(fromRaw, 1), 1, maxAya),
      toAya: clamp(toInt(toRaw, maxAya), 1, maxAya),
      grade: String(clamp(toInt(gradeRaw, 1), 1, 10))
    };
  }

  function normalizeLesson(raw, index) {
    var base = raw && typeof raw === 'object' ? raw : {};
    var hifdhRaw = listFromUnknown(base.hifdh);
    if (!hifdhRaw.length) hifdhRaw = listFromUnknown(base.hifdhEntries);
    if (!hifdhRaw.length) hifdhRaw = listFromUnknown(base.hifz);

    var revisionRaw = listFromUnknown(base.revision);
    if (!revisionRaw.length) revisionRaw = listFromUnknown(base.revisionEntries);
    if (!revisionRaw.length) revisionRaw = listFromUnknown(base.murajaah);

    return {
      index: Number(index || 0) + 1,
      title: String(base.title || ('الدرس ' + String(Number(index || 0) + 1))),
      hifdh: hifdhRaw.map(normalizeEntry),
      revision: revisionRaw.map(normalizeEntry)
    };
  }

  function normalizeCurriculum(raw) {
    var base = raw && typeof raw === 'object' ? raw : {};
    var lessonsRaw = listFromUnknown(base.lessons);
    if (!lessonsRaw.length) lessonsRaw = listFromUnknown(base.lessonRows);
    if (!lessonsRaw.length) lessonsRaw = listFromUnknown(base.planLessons);

    var lessons = lessonsRaw.map(function (row, idx) { return normalizeLesson(row, idx); });
    if (!lessons.length) lessons = [normalizeLesson({}, 0)];

    return {
      id: String(base.id || ''),
      halaqaId: String(base.halaqaId || base.circleId || base.halaqahId || ''),
      name: String(base.name || 'منهج'),
      section: String(base.section || 'mens') === 'womens' ? 'womens' : 'mens',
      lessons: lessons,
      updatedAt: String(base.updatedAt || '')
    };
  }

  function curriculumEntriesCount(c) {
    return (c.lessons || []).reduce(function (sum, lesson) {
      return sum + (Array.isArray(lesson.hifdh) ? lesson.hifdh.length : 0) + (Array.isArray(lesson.revision) ? lesson.revision.length : 0);
    }, 0);
  }

  function teacherCurriculumFlow() {
    if (!state.teacherCurriculumFlow || typeof state.teacherCurriculumFlow !== 'object') {
      state.teacherCurriculumFlow = {
        view: 'list',
        halaqaId: '',
        curriculumId: '',
        studentIndex: 0,
        loading: false,
        loadingProgress: false,
        loadingLessons: {},
        curricula: [],
        curriculaLoaded: false,
        error: '',
        progressByStudent: {},
        todaySessionsByStudent: {},
        draftsByStudentLesson: {},
        saving: false,
        progressLoadToken: '',
        lessonCache: {}
      };
    }
    if (!state.teacherCurriculumFlow.todaySessionsByStudent || typeof state.teacherCurriculumFlow.todaySessionsByStudent !== 'object') {
      state.teacherCurriculumFlow.todaySessionsByStudent = {};
    }
    return state.teacherCurriculumFlow;
  }

  function toast(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type);
  }

  function rerenderTeacherWorkspace() {
    if (typeof window.renderHalaqas === 'function') window.renderHalaqas();
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

  function firebaseAuthConfigured() {
    try {
      if (typeof auth !== 'undefined' && auth && typeof auth.signInWithEmailAndPassword === 'function') return true;
    } catch (_e) {}
    try {
      if (window.auth && typeof window.auth.signInWithEmailAndPassword === 'function') return true;
    } catch (_e2) {}
    try {
      if (window.firebase && typeof window.firebase.auth === 'function') {
        var a = window.firebase.auth();
        return !!a && typeof a.signInWithEmailAndPassword === 'function';
      }
    } catch (_e3) {}
    return false;
  }

  function firebaseCurrentUser() {
    try {
      if (typeof auth !== 'undefined' && auth && auth.currentUser) return auth.currentUser;
    } catch (_e) {}
    try {
      if (window.auth && window.auth.currentUser) return window.auth.currentUser;
    } catch (_e2) {}
    try {
      if (window.firebase && typeof window.firebase.auth === 'function') {
        var a = window.firebase.auth();
        return a && a.currentUser ? a.currentUser : null;
      }
    } catch (_e3) {}
    return null;
  }

  function firebaseCleanObject(value) {
    return JSON.parse(JSON.stringify(value == null ? {} : value));
  }

  function hasInvalidPathSegment(value) {
    var v = String(value == null ? '' : value).trim();
    if (!v) return true;
    var lower = v.toLowerCase();
    return lower === 'undefined' || lower === 'null';
  }

  function currentTeacherUser() {
    try {
      if (typeof window.currentUser === 'function') return window.currentUser();
    } catch (_e) {}
    return null;
  }

  function teacherVisibleHalaqas() {
    try {
      if (typeof window.visibleHalaqas === 'function') {
        var out = window.visibleHalaqas();
        if (Array.isArray(out)) return out.slice();
      }
    } catch (_e) {}

    var u = currentTeacherUser();
    var all = Array.isArray(state.db && state.db.halaqas) ? state.db.halaqas.slice() : [];
    if (!u || u.role !== 'teacher') return [];
    var allow = new Set(Array.isArray(u.assignedHalaqaIds) ? u.assignedHalaqaIds : []);
    return all.filter(function (h) { return allow.has(h.id); });
  }

  function sortedStudentsForHalaqa(halaqaId) {
    var list = [];
    if (state.indexes && state.indexes.studentsByHalaqa && Array.isArray(state.indexes.studentsByHalaqa[halaqaId])) {
      list = state.indexes.studentsByHalaqa[halaqaId].slice();
    } else if (Array.isArray(state.db && state.db.students)) {
      list = state.db.students.filter(function (s) { return String(s.halaqaId) === String(halaqaId); });
    }
    return list.sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
  }

  function localFallbackCurricula() {
    var settings = state.db && state.db.settings && state.db.settings.manhajAddon;
    var rows = settings && settings.plans ? listFromUnknown(settings.plans) : [];
    return rows.map(normalizeCurriculum).filter(function (c) { return c.id && c.halaqaId; });
  }

  function fetchCurriculaFromFirebase() {
    var ref = getRealtimeDatabaseRef('curricula');
    if (!ref) return Promise.resolve([]);
    return ref.once('value')
      .then(function (snap) {
        var raw = snap && typeof snap.val === 'function' ? snap.val() : null;
        var rows = listFromUnknown(raw);
        return rows.map(function (row, idx) {
          var base = row && typeof row === 'object' ? row : {};
          if (!base.id) {
            var keys = raw && typeof raw === 'object' ? Object.keys(raw) : [];
            var key = keys[idx];
            if (key && !base.id) base.id = key;
          }
          return normalizeCurriculum(base);
        }).filter(function (c) { return c.id && c.halaqaId; });
      })
      .catch(function () { return []; });
  }

  function ensureCurriculaLoaded(force) {
    var flow = teacherCurriculumFlow();
    if (!force && flow.curriculaLoaded) return Promise.resolve(flow.curricula);
    flow.loading = true;
    flow.error = '';
    rerenderTeacherWorkspace();
    return fetchCurriculaFromFirebase().then(function (cloudRows) {
      var rows = cloudRows.length ? cloudRows : localFallbackCurricula();
      rows = rows
        .filter(function (c) { return c.id && c.halaqaId; })
        .sort(function (a, b) {
          var aCount = curriculumEntriesCount(a);
          var bCount = curriculumEntriesCount(b);
          if (aCount !== bCount) return bCount - aCount;
          return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        });
      flow.curricula = rows;
      flow.curriculaLoaded = true;
      flow.loading = false;
      if (!rows.some(function (c) { return String(c.id) === String(flow.curriculumId); })) {
        flow.curriculumId = '';
        flow.halaqaId = '';
        flow.view = 'list';
      }
      rerenderTeacherWorkspace();
      return rows;
    }).catch(function () {
      flow.loading = false;
      flow.error = 'تعذر تحميل بيانات المنهج حالياً.';
      rerenderTeacherWorkspace();
      return [];
    });
  }

  function getTeacherCurriculaPairs() {
    var flow = teacherCurriculumFlow();
    var halaqas = teacherVisibleHalaqas();
    var map = new Map(halaqas.map(function (h) { return [String(h.id), h]; }));
    return flow.curricula
      .filter(function (c) { return map.has(String(c.halaqaId)); })
      .map(function (c) {
        return {
          curriculum: c,
          halaqa: map.get(String(c.halaqaId))
        };
      });
  }

  function selectedPair() {
    var flow = teacherCurriculumFlow();
    var pairs = getTeacherCurriculaPairs();
    for (var i = 0; i < pairs.length; i += 1) {
      if (String(pairs[i].curriculum.id) === String(flow.curriculumId)) return pairs[i];
    }
    return null;
  }

  function lessonCacheKey(curriculumId, lessonNo) {
    return String(curriculumId || '') + '__' + String(lessonNo || '1');
  }

  function todaySessionKey(curriculumId, studentId, dateISO) {
    return String(curriculumId || '') + '__' + String(studentId || '') + '__' + String(dateISO || '');
  }

  function normalizeTodaySession(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var base = raw;
    var lessonRaw = Number(base.lessonNumber);
    var lessonNumber = Number.isFinite(lessonRaw) && lessonRaw >= 1 ? Math.floor(lessonRaw) : 1;
    return {
      lessonNumber: lessonNumber,
      completed: !!base.completed,
      attendance: normalizeAttendance(base.attendance),
      hifdh: listFromUnknown(base.hifdh).map(normalizeEntry),
      revision: listFromUnknown(base.revision).map(normalizeEntry),
      note: String(base.note || '')
    };
  }

  function getTodaySessionRecord(curriculumId, studentId, dateISO) {
    var flow = teacherCurriculumFlow();
    var key = todaySessionKey(curriculumId, studentId, dateISO);
    if (Object.prototype.hasOwnProperty.call(flow.todaySessionsByStudent, key)) {
      return flow.todaySessionsByStudent[key];
    }
    return undefined;
  }

  function setTodaySessionRecord(curriculumId, studentId, dateISO, session) {
    var flow = teacherCurriculumFlow();
    var key = todaySessionKey(curriculumId, studentId, dateISO);
    flow.todaySessionsByStudent[key] = session == null ? null : normalizeTodaySession(session);
  }

  function lessonForCurriculum(curriculum, lessonNo) {
    var idx = clamp(Number(lessonNo || 1), 1, Math.max(1, curriculum.lessons.length || 1)) - 1;
    return curriculum.lessons[idx] || normalizeLesson({}, idx);
  }

  function ensureLessonFromFirebase(curriculum, lessonNo) {
    var flow = teacherCurriculumFlow();
    var cId = String(curriculum.id || '');
    var n = clamp(Number(lessonNo || 1), 1, 9999);
    var key = lessonCacheKey(cId, n);
    if (flow.lessonCache[key]) return Promise.resolve(flow.lessonCache[key]);
    if (flow.loadingLessons[key]) return flow.loadingLessons[key];

    var primary = getRealtimeDatabaseRef('curricula/' + cId + '/lessons/' + n);
    var fallback = getRealtimeDatabaseRef('curricula/' + cId + '/lessons/' + (n - 1));

    var req = Promise.resolve()
      .then(function () {
        if (!primary) return null;
        return primary.once('value').then(function (snap) {
          return snap && typeof snap.val === 'function' ? snap.val() : null;
        }).catch(function () { return null; });
      })
      .then(function (row) {
        if (row) return row;
        if (!fallback || n <= 1) return null;
        return fallback.once('value').then(function (snap) {
          return snap && typeof snap.val === 'function' ? snap.val() : null;
        }).catch(function () { return null; });
      })
      .then(function (row) {
        var lesson = row ? normalizeLesson(row, n - 1) : lessonForCurriculum(curriculum, n);
        flow.lessonCache[key] = lesson;
        return lesson;
      })
      .finally(function () {
        delete flow.loadingLessons[key];
        rerenderTeacherWorkspace();
      });

    flow.loadingLessons[key] = req;
    return req;
  }

  function readCurrentLesson(curriculumId, studentId) {
    var ref = getRealtimeDatabaseRef('curricula/' + curriculumId + '/studentProgress/' + studentId + '/currentLesson');
    if (!ref) return Promise.resolve(1);
    return ref.once('value').then(function (snap) {
      var raw = snap && typeof snap.val === 'function' ? snap.val() : 1;
      var n = Number(raw);
      return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    }).catch(function () { return 1; });
  }

  function readTodaySession(curriculumId, studentId, dateISO) {
    var ref = getRealtimeDatabaseRef('curricula/' + curriculumId + '/studentProgress/' + studentId + '/sessions/' + dateISO);
    if (!ref) return Promise.resolve(null);
    return ref.once('value').then(function (snap) {
      var raw = snap && typeof snap.val === 'function' ? snap.val() : null;
      return normalizeTodaySession(raw);
    }).catch(function () { return null; });
  }

  function ensureProgressLoaded(pair) {
    var flow = teacherCurriculumFlow();
    if (!pair || !pair.curriculum || !pair.halaqa) return Promise.resolve();
    var students = sortedStudentsForHalaqa(pair.halaqa.id);
    var dateISO = todayISODate();
    var token = String(pair.curriculum.id) + '__' + String(students.length) + '__' + String(Date.now());
    flow.progressLoadToken = token;
    flow.loadingProgress = true;

    return Promise.all(students.map(function (student) {
      return Promise.all([
        readCurrentLesson(pair.curriculum.id, student.id),
        readTodaySession(pair.curriculum.id, student.id, dateISO)
      ]).then(function (parts) {
        return {
          studentId: String(student.id),
          lessonNo: parts[0],
          todaySession: parts[1]
        };
      });
    })).then(function (rows) {
      if (flow.progressLoadToken !== token) return;
      rows.forEach(function (row) {
        flow.progressByStudent[row.studentId] = {
          currentLesson: row.lessonNo,
          updatedAt: isoNow()
        };
        setTodaySessionRecord(pair.curriculum.id, row.studentId, dateISO, row.todaySession);
      });
    }).finally(function () {
      if (flow.progressLoadToken !== token) return;
      flow.loadingProgress = false;
      rerenderTeacherWorkspace();
    });
  }

  function studentLessonNumber(curriculum, studentId) {
    var flow = teacherCurriculumFlow();
    var p = flow.progressByStudent[String(studentId)] || null;
    var total = Math.max(1, Number(curriculum.lessons.length || 1));
    var n = p ? Number(p.currentLesson || 1) : 1;
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > total) n = total;
    return n;
  }

  function activeLessonNumberForStudent(curriculum, studentId, dateISO) {
    var session = getTodaySessionRecord(curriculum.id, studentId, dateISO);
    var total = Math.max(1, Number(curriculum.lessons.length || 1));
    if (session && Number(session.lessonNumber) >= 1) {
      return clamp(Number(session.lessonNumber), 1, total);
    }
    return studentLessonNumber(curriculum, studentId);
  }

  function overlapCount(aFrom, aTo, bFrom, bTo) {
    var left = Math.max(Number(aFrom || 0), Number(bFrom || 0));
    var right = Math.min(Number(aTo || 0), Number(bTo || 0));
    if (right < left) return 0;
    return right - left + 1;
  }

  function draftKey(studentId, lessonNo) {
    return String(studentId || '') + '__' + String(lessonNo || 1);
  }

  function ensureDraft(studentId, lessonNo, lesson, sessionRow) {
    var flow = teacherCurriculumFlow();
    var key = draftKey(studentId, lessonNo);
    if (flow.draftsByStudentLesson[key]) {
      if (typeof flow.draftsByStudentLesson[key].attendance !== 'string') {
        flow.draftsByStudentLesson[key].attendance = '';
      }
      return flow.draftsByStudentLesson[key];
    }
    var source = sessionRow && typeof sessionRow === 'object' ? sessionRow : null;
    var hRows = source ? listFromUnknown(source.hifdh).map(normalizeEntry) : listFromUnknown(lesson && lesson.hifdh).map(normalizeEntry);
    var rRows = source ? listFromUnknown(source.revision).map(normalizeEntry) : listFromUnknown(lesson && lesson.revision).map(normalizeEntry);
    flow.draftsByStudentLesson[key] = {
      hifdh: hRows,
      revision: rRows,
      note: source ? String(source.note || '') : '',
      attendance: source ? normalizeAttendance(source.attendance) : ''
    };
    return flow.draftsByStudentLesson[key];
  }

  function setDraftField(studentId, lessonNo, part, idx, field, value) {
    var pair = selectedPair();
    if (!pair) return;
    var lesson = lessonForCurriculum(pair.curriculum, lessonNo);
    var draft = ensureDraft(studentId, lessonNo, lesson);
    var rows = String(part) === 'revision' ? draft.revision : draft.hifdh;
    if (!rows[idx]) return;
    if (field === 'grade') {
      rows[idx].grade = String(clamp(toInt(value, 1), 1, 10));
    } else if (field === 'fromAya' || field === 'toAya') {
      var raw = toEnglishDigits(String(value == null ? '' : value)).replace(/[^\d]/g, '');
      rows[idx][field] = raw ? Number(raw) : '';
    }
    rerenderTeacherWorkspace();
  }

  function setDraftNote(studentId, lessonNo, text) {
    var pair = selectedPair();
    if (!pair) return;
    var lesson = lessonForCurriculum(pair.curriculum, lessonNo);
    var draft = ensureDraft(studentId, lessonNo, lesson);
    draft.note = String(text || '');
  }

  function setDraftAttendance(studentId, lessonNo, attendanceKey) {
    var pair = selectedPair();
    if (!pair) return;
    var lesson = lessonForCurriculum(pair.curriculum, lessonNo);
    var dateISO = todayISODate();
    var session = getTodaySessionRecord(pair.curriculum.id, studentId, dateISO) || null;
    var draft = ensureDraft(studentId, lessonNo, lesson, session);
    draft.attendance = normalizeAttendance(attendanceKey);
    rerenderTeacherWorkspace();
  }

  function statusFromEntry(required, actual) {
    var req = normalizeEntry(required || {});
    var row = normalizeEntry(actual || {});
    if (Number(row.surahIdx) !== Number(req.surahIdx)) return { cls: 'none', label: 'لم يحفظ' };
    if (row.fromAya <= req.fromAya && row.toAya >= req.toAya) return { cls: 'done', label: 'أتم' };
    if (overlapCount(row.fromAya, row.toAya, req.fromAya, req.toAya) > 0) return { cls: 'partial', label: 'جزء' };
    return { cls: 'none', label: 'لم يحفظ' };
  }

  function entriesText(rows) {
    var list = listFromUnknown(rows).map(normalizeEntry);
    if (!list.length) return '—';
    return list.map(function (entry) {
      var s = surahByIdx(entry.surahIdx);
      return (s ? s.name : 'سورة') + ' (' + entry.fromAya + '-' + entry.toAya + ')';
    }).join(' + ');
  }

  async function saveSession(completed) {
    var flow = teacherCurriculumFlow();
    if (flow.saving) return;
    var pair = selectedPair();
    if (!pair) return;
    var students = sortedStudentsForHalaqa(pair.halaqa.id);
    if (!students.length) return;
    var idx = clamp(Number(flow.studentIndex || 0), 0, students.length - 1);
    var student = students[idx];
    var curriculumId = String(pair.curriculum.id || '').trim();
    var studentId = String(student.id || '').trim();
    var halaqaId = String(pair.halaqa.id || '').trim();
    var sessionDate = todayISODate();
    var lessonNo = activeLessonNumberForStudent(pair.curriculum, student.id, sessionDate);
    var existingTodaySession = getTodaySessionRecord(curriculumId, studentId, sessionDate) || null;
    var lesson = flow.lessonCache[lessonCacheKey(pair.curriculum.id, lessonNo)] || lessonForCurriculum(pair.curriculum, lessonNo);
    var draft = ensureDraft(student.id, lessonNo, lesson, existingTodaySession);
    var attendance = normalizeAttendance(draft.attendance);
    if (!attendance) {
      toast('اختر حالة التحضير قبل الحفظ', 'err');
      return;
    }

    var hRows = listFromUnknown(draft.hifdh).map(normalizeEntry);
    var rRows = listFromUnknown(draft.revision).map(normalizeEntry);

    if (hasInvalidPathSegment(curriculumId) || hasInvalidPathSegment(studentId) || hasInvalidPathSegment(sessionDate)) {
      console.error('[TeacherCurriculumTab] invalid Firebase path segment', {
        curriculumId: curriculumId,
        studentId: studentId,
        sessionDate: sessionDate
      });
      toast('تعذر الحفظ: مسار بيانات غير صالح', 'err');
      return;
    }

    if (firebaseAuthConfigured() && !firebaseCurrentUser()) {
      console.error('[TeacherCurriculumTab] not authenticated before save');
      toast('تعذر الحفظ: الحساب غير مسجل في Firebase', 'err');
      return;
    }

    var sessionPath = 'curricula/' + curriculumId + '/studentProgress/' + studentId + '/sessions/' + sessionDate;
    var progressPath = 'curricula/' + curriculumId + '/studentProgress/' + studentId;
    var sessionRef = getRealtimeDatabaseRef(sessionPath);
    var progressRef = getRealtimeDatabaseRef(progressPath);

    if (!sessionRef || !progressRef) {
      toast('تعذر الاتصال بقاعدة البيانات السحابية', 'err');
      return;
    }

    var totalLessons = Math.max(1, Number(pair.curriculum.lessons.length || 1));
    var nextLesson = completed ? clamp(lessonNo + 1, 1, totalLessons) : lessonNo;

    var payload = {
      date: sessionDate,
      at: isoNow(),
      halaqaId: halaqaId,
      studentId: studentId,
      lessonNumber: Number(lessonNo),
      completed: !!completed,
      attendance: attendance,
      hifdh: hRows,
      revision: rRows,
      note: String(draft.note || '')
    };
    var cleanPayload = firebaseCleanObject(payload);
    var progressUpdate = firebaseCleanObject({
      currentLesson: Number(nextLesson),
      updatedAt: isoNow(),
      lastSessionDate: sessionDate
    });

    flow.saving = true;
    rerenderTeacherWorkspace();

    console.log('[TeacherCurriculumTab] saving to path:', sessionPath);
    console.log('[TeacherCurriculumTab] updating progress path:', progressPath);
    console.log('[TeacherCurriculumTab] payload preview:', cleanPayload);

    try {
      await sessionRef.set(cleanPayload);
      await progressRef.update(progressUpdate);

      flow.progressByStudent[studentId] = {
        currentLesson: Number(nextLesson),
        updatedAt: isoNow()
      };
      setTodaySessionRecord(curriculumId, studentId, sessionDate, payload);

      if (idx >= students.length - 1) {
        flow.view = 'overview';
        flow.studentIndex = 0;
      } else {
        flow.studentIndex = idx + 1;
      }
      toast(completed ? 'تم حفظ الجلسة وإتمام الدرس' : 'تم حفظ الجلسة بدون ترقية الدرس');
    } catch (err) {
      var code = String(err && err.code ? err.code : 'unknown');
      var message = String(err && err.message ? err.message : 'unknown');
      console.error('[TeacherCurriculumTab] Firebase save error:', code, message, {
        sessionPath: sessionPath,
        progressPath: progressPath,
        payload: cleanPayload,
        progressUpdate: progressUpdate
      });
      toast('تعذر حفظ تقييم المنهج في Firebase (' + code + ')', 'err');
    } finally {
      flow.saving = false;
      rerenderTeacherWorkspace();
    }
  }

  function renderListView(pairs, flow) {
    if (!pairs.length) {
      return '<div class="tw-card"><h3>المنهج</h3><p class="muted" style="margin-top:8px;">لا توجد حلقات لها منهج مسند.</p></div>';
    }
    return [
      '<div class="tw-card">',
      '  <div class="tw-head"><div><h3>حلقات المنهج</h3><p>اختر الحلقة لبدء تقييم المنهج</p></div></div>',
      '  <div class="tw-halaqa-grid" style="margin-top:10px;">',
      pairs.map(function (pair) {
        var studentsCount = sortedStudentsForHalaqa(pair.halaqa.id).length;
        return [
          '<button type="button" class="tw-halaqa-item" onclick="teacherCurriculumSelectHalaqa(\'' + esc(pair.halaqa.id) + '\',\'' + esc(pair.curriculum.id) + '\')">',
          '  <div class="tw-head"><div class="name">' + esc(pair.halaqa.circleName || '-') + '</div><span class="tw-pill">منهج مسند</span></div>',
          '  <div class="tw-halaqa-meta">',
          '    <span>المنهج: ' + esc(pair.curriculum.name || '-') + '</span>',
          '    <span>الدروس: ' + Number(pair.curriculum.lessons.length || 0) + '</span>',
          '    <span>الطلاب: ' + Number(studentsCount) + '</span>',
          '  </div>',
          '</button>'
        ].join('');
      }).join(''),
      '  </div>',
      '</div>'
    ].join('');
  }

  function renderOverviewView(pair, flow) {
    var students = sortedStudentsForHalaqa(pair.halaqa.id);
    var totalLessons = Math.max(1, Number(pair.curriculum.lessons.length || 1));
    var dateISO = todayISODate();
    var rowsHtml = students.map(function (student) {
      var lessonNo = activeLessonNumberForStudent(pair.curriculum, student.id, dateISO);
      var percent = clamp(Math.round((lessonNo / totalLessons) * 100), 0, 100);
      var session = getTodaySessionRecord(pair.curriculum.id, student.id, dateISO);
      var statusLine = session ? '<div class="muted" style="font-size:12px; margin-top:4px;">تم حفظ تقييم اليوم ويمكن تعديله</div>' : '';
      return [
        '<tr onclick="teacherCurriculumOpenStudent(\'' + esc(student.id) + '\')" style="cursor:pointer;">',
        '  <td>' + esc(student.name || '-') + statusLine + '</td>',
        '  <td>درس ' + Number(lessonNo) + '</td>',
        '  <td><div class="manhaj-mini-progress"><span style="width:' + Number(percent) + '%"></span></div><div style="font-size:12px; margin-top:4px;">' + Number(percent) + '%</div></td>',
        '</tr>'
      ].join('');
    }).join('') || '<tr><td colspan="3" class="muted">لا يوجد طلاب في الحلقة.</td></tr>';

    return [
      '<div class="tw-card">',
      '  <div class="tw-head">',
      '    <div>',
      '      <h3>' + esc(pair.halaqa.circleName || '-') + '</h3>',
      '      <p>المنهج: ' + esc(pair.curriculum.name || '-') + '</p>',
      '    </div>',
      '    <div class="row" style="gap:6px;">',
      '      <button type="button" class="btn btn-light" onclick="teacherCurriculumBackToList()">↩ الحلقات</button>',
      '      <button type="button" class="btn btn-primary" onclick="teacherCurriculumStartEvaluation()">بدء التقييم</button>',
      '    </div>',
      '  </div>',
      (flow.loadingProgress ? '<p class="muted" style="margin-top:8px;">جار تحميل تقدم الطلاب من السحابة...</p>' : ''),
      '  <div class="manhaj-progress-table-wrap" style="margin-top:10px;">',
      '    <table class="manhaj-progress-table">',
      '      <thead><tr><th>اسم الطالب</th><th>درسه الحالي</th><th>التقدم</th></tr></thead>',
      '      <tbody>' + rowsHtml + '</tbody>',
      '    </table>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function renderEntryRows(student, lessonNo, part, requiredRows, draftRows) {
    var rows = listFromUnknown(requiredRows).map(normalizeEntry);
    if (!rows.length) return '<p class="muted" style="font-size:12px; margin-top:6px;">لا توجد سور محددة في هذا القسم.</p>';

    return rows.map(function (required, idx) {
      var current = draftRows[idx] ? normalizeEntry(draftRows[idx]) : normalizeEntry(required);
      var s = surahByIdx(required.surahIdx);
      var status = statusFromEntry(required, current);
      return [
        '<div class="manhaj-lesson-row">',
        '  <div class="manhaj-lesson-row-head">',
        '    <b>' + esc((s ? (s.n + '. ' + s.name) : 'سورة') + ' (' + required.fromAya + '-' + required.toAya + ')') + '</b>',
        '    <span class="manhaj-step-pill ' + esc(status.cls) + '">' + esc(status.label) + '</span>',
        '  </div>',
        '  <div class="manhaj-lesson-fields">',
        '    <label><span>من آية</span><input type="text" inputmode="numeric" dir="ltr" value="' + esc(current.fromAya) + '" onchange="teacherCurriculumSetField(\'' + esc(student.id) + '\',' + Number(lessonNo) + ',\'' + esc(part) + '\',' + Number(idx) + ',\'fromAya\',this.value)" /></label>',
        '    <label><span>إلى آية</span><input type="text" inputmode="numeric" dir="ltr" value="' + esc(current.toAya) + '" onchange="teacherCurriculumSetField(\'' + esc(student.id) + '\',' + Number(lessonNo) + ',\'' + esc(part) + '\',' + Number(idx) + ',\'toAya\',this.value)" /></label>',
        '  </div>',
        '  <div class="tw-grade-row" style="margin-top:8px;">',
        [1,2,3,4,5,6,7,8,9,10].map(function (g) {
          return '<button type="button" class="tw-grade-btn ' + (String(current.grade) === String(g) ? 'active' : '') + '" onclick="teacherCurriculumSetField(\'' + esc(student.id) + '\',' + Number(lessonNo) + ',\'' + esc(part) + '\',' + Number(idx) + ',\'grade\',\'' + String(g) + '\')">' + String(g) + '</button>';
        }).join(''),
        '  </div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function renderEvaluateView(pair, flow) {
    var students = sortedStudentsForHalaqa(pair.halaqa.id);
    if (!students.length) {
      return '<div class="tw-card"><h3>' + esc(pair.halaqa.circleName || '-') + '</h3><p class="muted" style="margin-top:8px;">لا يوجد طلاب في الحلقة.</p></div>';
    }

    var idx = clamp(Number(flow.studentIndex || 0), 0, students.length - 1);
    flow.studentIndex = idx;
    var dateISO = todayISODate();
    var student = students[idx];
    var lessonNo = activeLessonNumberForStudent(pair.curriculum, student.id, dateISO);
    var todaySession = getTodaySessionRecord(pair.curriculum.id, student.id, dateISO);
    if (typeof todaySession === 'undefined' && !flow.loadingProgress) {
      ensureProgressLoaded(pair);
    }
    if (typeof todaySession === 'undefined') {
      return '<div class="tw-card"><h3>تقييم المنهج</h3><p class="muted" style="margin-top:8px;">جار تحميل تقييم اليوم...</p></div>';
    }
    var cacheKey = lessonCacheKey(pair.curriculum.id, lessonNo);
    var lesson = flow.lessonCache[cacheKey] || lessonForCurriculum(pair.curriculum, lessonNo);

    ensureLessonFromFirebase(pair.curriculum, lessonNo);

    var draft = ensureDraft(student.id, lessonNo, lesson, todaySession || null);
    var attendance = normalizeAttendance(draft.attendance);
    var absentMode = attendance === 'absent';
    var dotHtml = students.map(function (st, i) {
      var currentNo = activeLessonNumberForStudent(pair.curriculum, st.id, dateISO);
      var saved = !!getTodaySessionRecord(pair.curriculum.id, st.id, dateISO);
      var label = String(st.name || '-').trim().split(' ')[0] || 'طالب';
      return '<button type="button" class="tw-dot ' + (saved ? 'done' : 'pending') + (i === idx ? ' active' : '') + '" title="' + esc(st.name || '-') + '" onclick="teacherCurriculumOpenStudent(\'' + esc(st.id) + '\')">' + esc(label) + '<small>' + esc('د' + currentNo) + '</small></button>';
    }).join('');

    return [
      '<div class="tw-card">',
      '  <div class="tw-head">',
      '    <div>',
      '      <h3>تقييم المنهج</h3>',
      '      <p>' + esc(pair.halaqa.circleName || '-') + ' • الطالب ' + Number(idx + 1) + ' من ' + Number(students.length) + '</p>',
      '    </div>',
      '    <button type="button" class="btn btn-light" onclick="teacherCurriculumBackToOverview()">↩ التقدم</button>',
      '  </div>',
      '  <div class="tw-progress" style="margin-top:10px;">',
      '    <div class="tw-head"><b>شريط تقدم الطلاب</b><span class="tw-pill">درس ' + Number(lessonNo) + '</span></div>',
      '    <div class="tw-dot-grid">' + dotHtml + '</div>',
      '  </div>',
      '</div>',
      '<div class="tw-card">',
      '  <div class="tw-student-name">' + esc(student.name || '-') + ' <span class="tw-pill" style="margin-inline-start:8px;">درس ' + Number(lessonNo) + '</span></div>',
      '  <div class="manhaj-student-banner"><b>المطلوب:</b> الحفظ: ' + esc(entriesText(lesson.hifdh)) + ' — المراجعة: ' + esc(entriesText(lesson.revision)) + '</div>',
      (todaySession ? '  <div class="manhaj-editable-note">تم حفظ تقييم هذا الطالب اليوم. يمكنك التعديل قبل بدء يوم جديد.</div>' : ''),
      '  <div class="tw-entry-section">',
      '    <div class="tw-entry-head"><h4>التحضير</h4></div>',
      '    <div class="tw-att-grid">',
      CURRICULUM_ATTENDANCE.map(function (att) {
        return '<button type="button" class="tw-att-btn ' + esc(att.key) + ' ' + (attendance === att.key ? 'active' : '') + '" onclick="teacherCurriculumSetAttendance(\'' + esc(student.id) + '\',' + Number(lessonNo) + ',\'' + esc(att.key) + '\')">' + esc(att.label) + '</button>';
      }).join(''),
      '    </div>',
      '  </div>',
      '  <div class="tw-entry-section ' + (absentMode ? 'disabled' : '') + '">',
      '    <div class="tw-entry-head"><h4>قسم الحفظ</h4></div>',
      renderEntryRows(student, lessonNo, 'hifdh', lesson.hifdh, draft.hifdh),
      '  </div>',
      '  <div class="tw-entry-section ' + (absentMode ? 'disabled' : '') + '">',
      '    <div class="tw-entry-head"><h4>قسم المراجعة</h4></div>',
      renderEntryRows(student, lessonNo, 'revision', lesson.revision, draft.revision),
      '  </div>',
      '  <div class="tw-note">',
      '    <div class="field-label">ملاحظة</div>',
      '    <textarea placeholder="ملاحظة اختيارية" onchange="teacherCurriculumSetNote(\'' + esc(student.id) + '\',' + Number(lessonNo) + ',this.value)">' + esc(draft.note || '') + '</textarea>',
      '  </div>',
      '  <div class="tw-actions">',
      '    <button type="button" class="btn btn-ok" ' + (flow.saving ? 'disabled' : '') + ' onclick="teacherCurriculumSaveComplete()">أتم الدرس ✓</button>',
      '    <button type="button" class="btn btn-primary" ' + (flow.saving ? 'disabled' : '') + ' onclick="teacherCurriculumSaveIncomplete()">لم يكمل ←</button>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function injectStyles() {
    if (document.getElementById('teacherCurriculumStyles')) return;
    var style = document.createElement('style');
    style.id = 'teacherCurriculumStyles';
    style.textContent = [
      '.manhaj-progress-table-wrap{border:1px solid #e2e8f0;border-radius:12px;overflow:auto;background:#fff;}',
      '.manhaj-progress-table{width:100%;border-collapse:collapse;min-width:680px;}',
      '.manhaj-progress-table th,.manhaj-progress-table td{border-top:1px solid #e2e8f0;padding:8px;text-align:right;font-size:13px;vertical-align:middle;}',
      '.manhaj-progress-table thead th{border-top:0;background:#f8fafc;color:#334155;font-weight:800;}',
      '.manhaj-mini-progress{height:8px;border-radius:999px;background:#e2e8f0;overflow:hidden;}',
      '.manhaj-mini-progress span{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#16a34a);}',
      '.manhaj-student-banner{margin:8px 0;border:1px solid #86efac;background:#f0fdf4;border-radius:10px;padding:8px;color:#166534;font-size:13px;}',
      '.manhaj-editable-note{margin:8px 0;border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px;padding:8px;color:#1d4ed8;font-size:13px;}',
      '.manhaj-lesson-row{border:1px dashed #cbd5e1;border-radius:10px;padding:8px;margin-bottom:8px;background:#fff;}',
      '.manhaj-lesson-row-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;flex-wrap:wrap;}',
      '.manhaj-lesson-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}',
      '.manhaj-lesson-fields label{display:grid;gap:4px;font-size:12px;color:#334155;}',
      '.manhaj-step-pill{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:800;}',
      '.manhaj-step-pill.done{background:#dcfce7;color:#166534;}',
      '.manhaj-step-pill.partial{background:#fef9c3;color:#854d0e;}',
      '.manhaj-step-pill.none{background:#e2e8f0;color:#475569;}',
      '@media (max-width:760px){.manhaj-lesson-fields{grid-template-columns:1fr;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function render() {
    if (!hasRuntime()) return '';
    injectStyles();
    var flow = teacherCurriculumFlow();

    if (!flow.curriculaLoaded && !flow.loading) ensureCurriculaLoaded(false);

    var pairs = getTeacherCurriculaPairs();

    if (flow.error) {
      return '<div class="tw-card"><h3>المنهج</h3><p style="color:#b91c1c; margin-top:8px;">' + esc(flow.error) + '</p><div class="tw-actions" style="margin-top:10px;"><button class="btn btn-light" onclick="teacherCurriculumReload()">إعادة المحاولة</button></div></div>';
    }

    if (flow.loading && !pairs.length) {
      return '<div class="tw-card"><h3>المنهج</h3><p class="muted" style="margin-top:8px;">جار تحميل بيانات المنهج...</p></div>';
    }

    if (flow.view === 'evaluate') {
      var pair = selectedPair();
      if (!pair) {
        flow.view = 'list';
      } else {
        return renderEvaluateView(pair, flow);
      }
    }

    if (flow.view === 'overview') {
      var selected = selectedPair();
      if (!selected) {
        flow.view = 'list';
      } else {
        if (!flow.loadingProgress) ensureProgressLoaded(selected);
        return renderOverviewView(selected, flow);
      }
    }

    return renderListView(pairs, flow);
  }

  function selectHalaqa(halaqaId, curriculumId) {
    var flow = teacherCurriculumFlow();
    if (flow.saving) return;
    flow.view = 'overview';
    flow.halaqaId = String(halaqaId || '');
    flow.curriculumId = String(curriculumId || '');
    flow.studentIndex = 0;
    flow.loadingProgress = false;
    rerenderTeacherWorkspace();
  }

  function backToList() {
    var flow = teacherCurriculumFlow();
    if (flow.saving) return;
    flow.view = 'list';
    flow.halaqaId = '';
    flow.curriculumId = '';
    flow.studentIndex = 0;
    rerenderTeacherWorkspace();
  }

  function backToOverview() {
    var flow = teacherCurriculumFlow();
    if (flow.saving) return;
    if (!flow.curriculumId) return backToList();
    flow.view = 'overview';
    flow.studentIndex = 0;
    rerenderTeacherWorkspace();
  }

  function startEvaluation() {
    var flow = teacherCurriculumFlow();
    if (flow.saving) return;
    flow.view = 'evaluate';
    flow.studentIndex = 0;
    rerenderTeacherWorkspace();
  }

  function openStudent(studentId) {
    var flow = teacherCurriculumFlow();
    if (flow.saving) return;
    var pair = selectedPair();
    if (!pair) return;
    var students = sortedStudentsForHalaqa(pair.halaqa.id);
    var idx = students.findIndex(function (s) { return String(s.id) === String(studentId); });
    flow.studentIndex = idx >= 0 ? idx : 0;
    flow.view = 'evaluate';
    rerenderTeacherWorkspace();
  }

  function reload() {
    var flow = teacherCurriculumFlow();
    flow.curriculaLoaded = false;
    flow.error = '';
    ensureCurriculaLoaded(true);
  }

  function exposeApi() {
    window.TeacherCurriculumTab = {
      render: render,
      reload: reload
    };
    window.teacherCurriculumReload = reload;
    window.teacherCurriculumSelectHalaqa = selectHalaqa;
    window.teacherCurriculumBackToList = backToList;
    window.teacherCurriculumBackToOverview = backToOverview;
    window.teacherCurriculumStartEvaluation = startEvaluation;
    window.teacherCurriculumOpenStudent = openStudent;
    window.teacherCurriculumSetAttendance = setDraftAttendance;
    window.teacherCurriculumSetField = setDraftField;
    window.teacherCurriculumSetNote = setDraftNote;
    window.teacherCurriculumSaveComplete = function () { saveSession(true); };
    window.teacherCurriculumSaveIncomplete = function () { saveSession(false); };
  }

  function init() {
    if (!hasRuntime()) return;
    exposeApi();
  }

  init();
})();
