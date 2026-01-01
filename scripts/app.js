// 自我系统应用主逻辑
class SelfSystem {
    constructor() {
        this.debugEnabled = localStorage.getItem('selfSystemDebug') === '1';
        if (!this.debugEnabled && !window.__selfSystemConsoleSilenced) {
            window.__selfSystemConsoleSilenced = true;
            console.log = () => {};
        }

        this.currentDate = new Date();
        this.selectedDate = new Date();
        this.schedules = this.loadSchedules();
        this.learningPlans = this.loadLearningPlans();
        this.readingPlans = this.loadReadingPlans();
        this.checklistTasks = this.loadChecklistTasks();
        this.checklistCheckins = this.loadChecklistCheckins();
        this.financeData = this.loadFinanceData();
        this.metamorphosisData = this.loadMetamorphosisData();
        this.sleepRoutineData = this.loadSleepRoutineData();
        this.sleepRoutineEditingKey = '';
        this.gkQuotes = this.loadGkQuotes();
        this.gkSettings = this.loadGkSettings();
        this.oxfordState = this.loadOxfordState();
        this.repaymentData = { loans: [], creditCards: [], paymentRecords: [] };
        this.timetableState = this.loadTimetableState();
        this.timetableViewDate = new Date();
        this.currentSystem = 'overview';
        this.todoCalendarInstance = null;
        this.metamorphosisViewMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        this.metamorphosisChartInstance = null;
        this.timetableInitialized = false;
        this.timetableAutoSaveTimers = { semester: null, scheme: null };
        this.timetableFeedbackTimer = null;
        this.statusTimer = null;
        
        this.init();
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.verifyMainRendering();
            });
        } else {
            this.verifyMainRendering();
        }
    }

    init() {
        this.setupGlobalErrorHandlers();
        try {
            this.setupEventListeners();
            this.resyncLearningPlansToTodoCalendar();
            this.resyncReadingPlansToTodoCalendar();
            this.updateDateDisplay();
            this.renderCalendar();
            this.updateOverviewStats();
            this.startDateAutoUpdate();
            this.initSidebarState();
            this.showSystem('overview');
            this.verifyMainRendering();
            this.loadReadingPlansFromApi();
            this.initGeneralKnowledgeModule();
        } catch (e) {
            this.showAppStatus('页面初始化失败，已尝试恢复默认视图', 'error', { sticky: true });
            try {
                this.showSystem('overview');
                this.verifyMainRendering();
            } catch {
            }
            console.error(e);
        }
    }

    setupGlobalErrorHandlers() {
        if (window.__selfSystemErrorHandlersBound) return;
        window.__selfSystemErrorHandlersBound = true;

        window.addEventListener('error', (event) => {
            const message = event?.message ? String(event.message) : '发生未知错误';
            this.showAppStatus(`发生错误：${message}`, 'error', { sticky: true });
        });

        window.addEventListener('unhandledrejection', (event) => {
            const reason = event?.reason;
            const message = reason?.message ? String(reason.message) : String(reason || 'Promise 异常');
            this.showAppStatus(`发生错误：${message}`, 'error', { sticky: true });
        });
    }

    showAppStatus(message, type = 'info', options = {}) {
        const el = document.getElementById('appStatus');
        if (!el) return;
        const { sticky = false, timeout = 2200 } = options || {};

        el.hidden = false;
        el.textContent = String(message || '');
        el.dataset.type = String(type || 'info');

        if (this.statusTimer) {
            window.clearTimeout(this.statusTimer);
            this.statusTimer = null;
        }

        if (!sticky) {
            this.statusTimer = window.setTimeout(() => {
                this.hideAppStatus();
            }, timeout);
        }
    }

    hideAppStatus() {
        const el = document.getElementById('appStatus');
        if (!el) return;
        el.hidden = true;
        el.textContent = '';
        delete el.dataset.type;
        if (this.statusTimer) {
            window.clearTimeout(this.statusTimer);
            this.statusTimer = null;
        }
    }

    verifyMainRendering() {
        const main = document.querySelector('main.main-content');
        if (!main) {
            this.showAppStatus('页面结构异常：找不到 main 容器', 'error', { sticky: true });
            return;
        }

        const sections = Array.from(main.querySelectorAll('.system-section'));
        const fallbackSection = document.getElementById('overview');
        const preferredId = (this.currentSystem && document.getElementById(this.currentSystem)) ? this.currentSystem : 'overview';
        const preferredSection = document.getElementById(preferredId) || fallbackSection;

        if (preferredSection) {
            const activeSections = sections.filter(section => section.classList.contains('active'));
            const activeMismatch =
                activeSections.length !== 1 ||
                activeSections[0] !== preferredSection;

            if (activeMismatch) {
                sections.forEach(section => section.classList.remove('active'));
                preferredSection.classList.add('active');
                if (activeSections.length === 0) {
                    this.showAppStatus('检测到内容未激活，已自动恢复显示', 'warning');
                }
            }
        }

        window.requestAnimationFrame(() => {
            const currentActive = main.querySelector('.system-section.active') || preferredSection;
            if (!currentActive) return;
            const mainStyle = window.getComputedStyle(main);
            const sectionStyle = window.getComputedStyle(currentActive);

            const mainHidden = mainStyle.display === 'none' || mainStyle.visibility === 'hidden' || Number(mainStyle.opacity) === 0;
            const sectionHidden = sectionStyle.display === 'none' || sectionStyle.visibility === 'hidden' || Number(sectionStyle.opacity) === 0;

            if (mainHidden || sectionHidden) {
                this.showAppStatus('检测到主内容被隐藏（样式异常），已尝试恢复', 'warning', { sticky: true });
                sections.forEach(section => section.classList.remove('active'));
                (preferredSection || fallbackSection)?.classList.add('active');
            }
        });
    }

    // 事件监听器设置
    setupEventListeners() {
        // 侧边栏展开/收缩
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            this.toggleSidebar();
        });

        // 移动端侧边栏切换
        document.getElementById('mobileToggle')?.addEventListener('click', () => {
            this.toggleMobileSidebar();
        });

        this.setupTooltips();

        // 系统导航
        const navItems = document.querySelectorAll('.nav-item');
        console.log('找到导航项数量:', navItems.length);
        navItems.forEach((item, index) => {
            console.log(`导航项 ${index}:`, item.dataset.system, item);
            item.addEventListener('click', (e) => {
                console.log('点击导航项:', e.currentTarget.dataset.system);
                console.log('事件目标:', e.target);
                console.log('当前目标:', e.currentTarget);
                const system = e.currentTarget.dataset.system;
                this.showSystem(system);
                
                // 在移动端点击导航项后自动关闭侧边栏
                if (window.innerWidth <= 768) {
                    console.log('移动端模式，自动关闭侧边栏');
                    this.hideMobileSidebar();
                }
            });
        });

        const overviewCards = document.querySelectorAll('#overview .pwa-metric-card[data-overview-system]');
        overviewCards.forEach((card) => {
            card.addEventListener('click', (e) => {
                const system = e.currentTarget?.dataset?.overviewSystem || '';
                if (!system) return;
                this.showSystem(system);
                if (window.innerWidth <= 768) {
                    this.hideMobileSidebar();
                }
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        });

        window.addEventListener('todoSchedulesUpdated', () => {
            if (this.currentSystem === 'checklist') {
                this.renderChecklist();
                this.updateChecklistStats();
            }
            if (this.currentSystem === 'overview') {
                this.updateOverviewStats();
            }
        });

        // 学习模块点击
        const learningCards = document.querySelectorAll('.learning-modules .module-card[data-module]');
        console.log('找到学习模块卡片数量:', learningCards.length);
        learningCards.forEach((card, index) => {
            console.log(`学习模块卡片 ${index}:`, card.dataset.module, card);
            card.addEventListener('click', (e) => {
                console.log('点击学习模块:', e.currentTarget.dataset.module);
                const module = e.currentTarget.dataset.module;
                this.showLearningModule(module);
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        });

        const englishSubmoduleCards = document.querySelectorAll('[data-english-submodule]');
        englishSubmoduleCards.forEach((card) => {
            card.addEventListener('click', (e) => {
                const submodule = e.currentTarget.dataset.englishSubmodule || '';
                if (!submodule) return;
                this.showEnglishSubmodule(submodule);
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        });

        const gkSubmoduleCards = document.querySelectorAll('[data-gk-submodule]');
        gkSubmoduleCards.forEach((card) => {
            card.addEventListener('click', (e) => {
                const submodule = e.currentTarget.dataset.gkSubmodule || '';
                if (!submodule) return;
                this.showGeneralKnowledgeSubmodule(submodule);
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        });

        document.querySelectorAll('[data-gk-back="home"]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showGeneralKnowledgeHome();
            });
        });

        // 财务模块点击
        const financeCards = document.querySelectorAll('.finance-modules .module-card[data-module]');
        console.log('找到财务模块卡片数量:', financeCards.length);
        financeCards.forEach((card, index) => {
            console.log(`财务模块卡片 ${index}:`, card.dataset.module, card);
            card.addEventListener('click', (e) => {
                console.log('点击财务模块:', e.currentTarget.dataset.module);
                const module = e.currentTarget.dataset.module;
                this.showFinanceModule(module);
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        });

        const lifeCards = document.querySelectorAll('.life-modules .module-card[data-module]');
        lifeCards.forEach((card) => {
            card.addEventListener('click', (e) => {
                const module = e.currentTarget.dataset.module;
                this.showLifeModule(module);
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        });

        // 刷新还款数据按钮
        const refreshRepaymentBtn = document.getElementById('refreshRepaymentDataBtn');
        if (refreshRepaymentBtn) {
            refreshRepaymentBtn.addEventListener('click', async () => {
                if (confirm('确定要刷新还款数据吗？这将重新加载借款文件并同步到待办日历。')) {
                    await this.loadRepaymentData(true);
                    this.updateRepaymentOverview();
                    this.renderRepaymentPlans();
                    this.renderUpcomingPayments();
                    this.renderPaymentRecords();
                    this.syncRepaymentToTodoCalendar();
                    alert('还款数据已刷新');
                }
            });
        }

        // 导出还款数据按钮
        const exportRepaymentBtn = document.getElementById('exportRepaymentDataBtn');
        if (exportRepaymentBtn) {
            exportRepaymentBtn.addEventListener('click', () => {
                this.exportRepaymentData();
            });
        }

        // 导入还款数据按钮
        const importRepaymentBtn = document.getElementById('importRepaymentDataBtn');
        const importRepaymentFile = document.getElementById('importRepaymentFile');
        if (importRepaymentBtn && importRepaymentFile) {
            importRepaymentBtn.addEventListener('click', () => {
                importRepaymentFile.click();
            });
            
            importRepaymentFile.addEventListener('change', (e) => {
                this.importRepaymentData(e);
            });
        }

        // 返回主页
        document.querySelectorAll('.back-to-home').forEach(button => {
            button.addEventListener('click', (e) => {
                const parentSection = e.currentTarget.closest('.system-section');
                if (!parentSection) return;
                if (parentSection.id === 'learning') {
                    const target = e.currentTarget.dataset.backTarget || '';
                    if (target === 'english') {
                        this.showLearningModule('english');
                    } else {
                        this.showLearningHome();
                    }
                } else if (parentSection.id === 'finance') {
                    this.showFinanceHome();
                } else if (parentSection.id === 'life') {
                    this.showLifeHome();
                }
            });
        });

        document.getElementById('metamorphosisCheckinForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleMetamorphosisCheckin();
        });

        document.getElementById('metamorphosisOpenCheckinBtn')?.addEventListener('click', () => {
            this.openMetamorphosisCheckinModal();
        });

        document.getElementById('closeMetamorphosisCheckinModal')?.addEventListener('click', () => {
            this.closeMetamorphosisCheckinModal();
        });

        document.getElementById('metamorphosisCheckinCancelBtn')?.addEventListener('click', () => {
            this.closeMetamorphosisCheckinModal();
        });

        document.getElementById('metamorphosisCheckinModal')?.addEventListener('click', (e) => {
            if (e.target?.id === 'metamorphosisCheckinModal') this.closeMetamorphosisCheckinModal();
        });

        document.querySelectorAll('input[name="metamorphosisPorn"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                this.syncMetamorphosisPornReasonVisibility();
            });
        });

        document.querySelectorAll('input[name="metamorphosisMasturbation"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                this.syncMetamorphosisMasturbationReasonVisibility();
            });
        });

        document.getElementById('metamorphosisTargetSelect')?.addEventListener('change', (e) => {
            this.handleMetamorphosisTargetChange(e.target.value);
        });

        document.getElementById('metamorphosisTargetButtons')?.addEventListener('click', (e) => {
            const button = e.target.closest('button.metamorphosis-pill');
            if (!button) return;
            const value = button.dataset.value;
            const select = document.getElementById('metamorphosisTargetSelect');
            if (select && value) {
                select.value = value;
                this.handleMetamorphosisTargetChange(value);
            }
        });

        document.getElementById('metamorphosisCustomTargetDays')?.addEventListener('input', (e) => {
            this.handleMetamorphosisCustomTargetInput(e.target.value);
        });

        document.getElementById('metamorphosisThemeSelect')?.addEventListener('change', (e) => {
            this.handleMetamorphosisThemeChange(e.target.value);
        });

        document.getElementById('metamorphosisThemeButtons')?.addEventListener('click', (e) => {
            const button = e.target.closest('button.metamorphosis-pill');
            if (!button) return;
            const value = button.dataset.value;
            const select = document.getElementById('metamorphosisThemeSelect');
            if (select && value) {
                select.value = value;
                this.handleMetamorphosisThemeChange(value);
            }
        });

        document.getElementById('metamorphosisPrevMonthBtn')?.addEventListener('click', () => {
            this.shiftMetamorphosisMonth(-1);
        });

        document.getElementById('metamorphosisNextMonthBtn')?.addEventListener('click', () => {
            this.shiftMetamorphosisMonth(1);
        });

        document.getElementById('exportMetamorphosisDataBtn')?.addEventListener('click', () => {
            this.exportMetamorphosisData();
        });

        document.getElementById('importMetamorphosisDataBtn')?.addEventListener('click', () => {
            document.getElementById('importMetamorphosisFile')?.click();
        });

        document.getElementById('importMetamorphosisFile')?.addEventListener('change', (e) => {
            this.importMetamorphosisData(e);
        });

        document.getElementById('readingForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveReadingPlan();
        });

        document.getElementById('readingResetBtn')?.addEventListener('click', () => {
            this.resetReadingForm();
        });

        document.querySelectorAll('input[name="readingRecurrenceType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.toggleReadingRecurrenceType(e.target.value);
            });
        });

        document.querySelectorAll('.quick-date-row button[data-quick-date]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const button = e.currentTarget;
                const row = button.closest('.quick-date-row');
                let targetId = row?.dataset?.target;
                if (!targetId) {
                    const groupInput = row?.closest('.form-group')?.querySelector('input, select, textarea');
                    if (groupInput?.id) targetId = groupInput.id;
                }
                if (!targetId) return;
                this.applyQuickDate(targetId, button.dataset.quickDate);
            });
        });

        document.getElementById('timetableExportIcsBtn')?.addEventListener('click', () => {
            this.exportTimetableIcs();
        });

        document.getElementById('timetableResyncBtn')?.addEventListener('click', () => {
            this.resyncTimetableToTodoCalendar();
        });

        (document.getElementById('timetableOpenSettingsBtn') || document.getElementById('timetableSettingsBtn'))?.addEventListener('click', () => {
            this.openTimetableSettingsModal();
        });

        document.getElementById('timetableCloseSettingsModal')?.addEventListener('click', () => {
            this.closeTimetableSettingsModal();
        });

        document.getElementById('timetableSettingsModal')?.addEventListener('click', (e) => {
            if (e.target?.id === 'timetableSettingsModal') this.closeTimetableSettingsModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('timetableSettingsModal')?.classList.contains('active')) {
                this.closeTimetableSettingsModal();
                return;
            }
            if (document.getElementById('timetableCourseModal')?.classList.contains('active')) {
                this.closeTimetableCourseModal();
                return;
            }
            if (document.getElementById('todoScheduleModal')?.classList.contains('active')) {
                this.todoCalendarInstance?.closeScheduleModal?.();
                return;
            }
            if (document.getElementById('learningPlanModal')?.classList.contains('active')) {
                this.hideLearningPlanModal();
                return;
            }
            if (document.getElementById('checklistModal')?.classList.contains('active')) {
                this.hideChecklistModal();
                return;
            }
            if (document.getElementById('scheduleModal')?.classList.contains('active')) {
                this.hideScheduleModal();
            }
        });

        document.getElementById('timetableSemesterSelect')?.addEventListener('change', (e) => {
            this.selectTimetableSemester(e.target.value);
        });

        const onTimetableSemesterFormChange = () => this.queueTimetableSemesterAutoSave();
        document.getElementById('timetableAcademicYear')?.addEventListener('input', onTimetableSemesterFormChange);
        document.getElementById('timetableTerm')?.addEventListener('change', onTimetableSemesterFormChange);
        document.getElementById('timetableSemesterStart')?.addEventListener('change', onTimetableSemesterFormChange);
        document.getElementById('timetableSemesterEnd')?.addEventListener('change', onTimetableSemesterFormChange);

        document.getElementById('timetableNewSemesterBtn')?.addEventListener('click', () => {
            this.createTimetableSemester();
        });

        document.getElementById('timetableDeleteSemesterBtn')?.addEventListener('click', () => {
            this.deleteActiveTimetableSemester();
        });

        document.getElementById('timetableSaveSemesterBtn')?.addEventListener('click', () => {
            this.saveActiveTimetableSemesterFromForm();
        });

        document.getElementById('timetableSchemeSelect')?.addEventListener('change', (e) => {
            this.selectTimetableSchemeForEdit(e.target.value);
        });

        const onTimetableSchemeFormChange = () => this.queueTimetableSchemeAutoSave();
        document.getElementById('timetableSchemeName')?.addEventListener('input', onTimetableSchemeFormChange);
        document.getElementById('timetablePeriodsBody')?.addEventListener('input', onTimetableSchemeFormChange);
        document.getElementById('timetablePeriodsBody')?.addEventListener('change', onTimetableSchemeFormChange);

        document.getElementById('timetableNewSchemeBtn')?.addEventListener('click', () => {
            this.createTimetableScheme();
        });

        document.getElementById('timetableAddPeriodBtn')?.addEventListener('click', () => {
            this.addPeriodToEditingScheme();
        });

        document.getElementById('timetableSaveSchemeBtn')?.addEventListener('click', () => {
            this.saveEditingTimetableSchemeFromForm();
        });

        document.getElementById('timetablePeriodsBody')?.addEventListener('click', (e) => {
            const btn = e.target.closest?.('[data-timetable-delete-period]');
            if (!btn) return;
            const idx = Number(btn.getAttribute('data-timetable-delete-period'));
            if (!Number.isFinite(idx)) return;
            this.deletePeriodFromEditingScheme(idx);
        });

        document.getElementById('timetableTimeSchemeSelect')?.addEventListener('change', (e) => {
            this.setActiveTimetableSemesterScheme(e.target.value);
        });

        document.getElementById('timetableParityEnabled')?.addEventListener('change', (e) => {
            const select = document.getElementById('timetableParityType');
            if (select) select.disabled = !e.target.checked;
        });

        document.getElementById('timetableCourseType')?.addEventListener('change', () => {
            this.updateTimetableCourseTypeUI();
        });

        const onExamDateChange = () => this.syncTimetableExamWeekdayFromDate();
        document.getElementById('timetableExamDate')?.addEventListener('input', onExamDateChange);
        document.getElementById('timetableExamDate')?.addEventListener('change', onExamDateChange);

        const onExamPeriodChange = () => this.normalizeTimetableExamPeriodRange();
        document.getElementById('timetableExamStartPeriod')?.addEventListener('change', onExamPeriodChange);
        document.getElementById('timetableExamEndPeriod')?.addEventListener('change', onExamPeriodChange);

        document.getElementById('timetableCourseForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTimetableCourseFromForm();
        });

        document.getElementById('timetableCourseResetBtn')?.addEventListener('click', () => {
            this.resetTimetableCourseForm();
        });

        document.getElementById('timetablePrevWeekBtn')?.addEventListener('click', () => {
            this.shiftTimetableWeek(-1);
        });

        document.getElementById('timetableNextWeekBtn')?.addEventListener('click', () => {
            this.shiftTimetableWeek(1);
        });

        document.getElementById('timetableTodayBtn')?.addEventListener('click', () => {
            this.goToTimetableCurrentWeek();
        });

        document.getElementById('timetableGrid')?.addEventListener('click', (e) => {
            const cell = e.target.closest?.('[data-timetable-course-id]');
            if (!cell) return;
            const id = cell.getAttribute('data-timetable-course-id');
            const date = cell.getAttribute('data-timetable-date') || '';
            if (id) this.openTimetableCourseModal(id, date);
        });

        document.getElementById('timetableCloseCourseModal')?.addEventListener('click', () => {
            this.closeTimetableCourseModal();
        });

        document.getElementById('timetableCourseModal')?.addEventListener('click', (e) => {
            if (e.target?.id === 'timetableCourseModal') this.closeTimetableCourseModal();
        });

        document.getElementById('timetableEditCourseBtn')?.addEventListener('click', () => {
            const id = document.getElementById('timetableCourseModal')?.dataset?.courseId || '';
            if (!id) return;
            this.editTimetableCourse(id);
            this.closeTimetableCourseModal();
        });

        document.getElementById('timetableDeleteCourseBtn')?.addEventListener('click', () => {
            const id = document.getElementById('timetableCourseModal')?.dataset?.courseId || '';
            if (!id) return;
            this.deleteTimetableCourse(id);
        });

        document.getElementById('openRunToEnglish')?.addEventListener('click', () => {
            this.openNewConceptUrl(this.getNewConceptBaseUrl(), { title: '极速英语首页' });
        });

        document.querySelectorAll('[data-new-concept-url]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.currentTarget.getAttribute('data-new-concept-url');
                if (!url) return;
                const title = e.currentTarget.querySelector?.('.new-concept-card-title')?.textContent?.trim() || '';
                this.openNewConceptUrl(url, { title });
            });
        });

        const newConceptSearchInput = document.getElementById('newConceptSearchInput');
        const newConceptSearchBtn = document.getElementById('newConceptSearchBtn');
        const doSearch = () => {
            const q = newConceptSearchInput?.value?.trim() || '';
            if (!q) return;
            const url = `${this.getNewConceptBaseUrl()}/search?q=${encodeURIComponent(q)}`;
            this.openNewConceptUrl(url, { title: `搜索：${q}` });
        };
        newConceptSearchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                doSearch();
            }
        });
        newConceptSearchBtn?.addEventListener('click', doSearch);

        const newConceptQuickSelect = document.getElementById('newConceptQuickSelect');
        document.getElementById('newConceptOpenQuickBtn')?.addEventListener('click', () => {
            const value = newConceptQuickSelect?.value || '';
            const label = newConceptQuickSelect?.selectedOptions?.[0]?.textContent?.trim() || '';
            if (!value) return;
            this.openNewConceptUrl(value, { title: label });
        });

        document.getElementById('newConceptOpenLessonBtn')?.addEventListener('click', () => {
            const raw = document.getElementById('newConceptLessonNumber')?.value;
            const n = Number(raw);
            if (!Number.isFinite(n) || n <= 0) return;
            this.openNewConceptUrl(`/lessons/${Math.floor(n)}`, { title: `课文 ${Math.floor(n)}` });
        });

        document.getElementById('newConceptClearRecentBtn')?.addEventListener('click', () => {
            this.clearNewConceptRecent();
        });
        document.getElementById('newConceptClearFavoritesBtn')?.addEventListener('click', () => {
            this.clearNewConceptFavorites();
        });

        const handleNewConceptListClick = (e) => {
            const openBtn = e.target.closest?.('[data-new-concept-open]');
            if (openBtn) {
                const url = openBtn.getAttribute('data-new-concept-open');
                if (url) this.openNewConceptUrl(url);
                return;
            }
            const favBtn = e.target.closest?.('[data-new-concept-fav]');
            if (favBtn) {
                const url = favBtn.getAttribute('data-new-concept-fav');
                if (url) this.toggleNewConceptFavorite(url);
            }
        };
        document.getElementById('newConceptRecentList')?.addEventListener('click', handleNewConceptListClick);
        document.getElementById('newConceptFavoritesList')?.addEventListener('click', handleNewConceptListClick);

        const englishMaterialsBaseUrl = 'https://www.englearner.site/cn/index.html';
        const englishMaterialsOrigin = 'https://www.englearner.site';
        const materialsIframe = document.getElementById('englishMaterialsFrame');

        const normalizeMaterialsUrl = (value) => {
            const raw = String(value || '').trim();
            if (!raw) return englishMaterialsBaseUrl;
            if (/^https?:\/\//i.test(raw)) return raw;
            if (raw.startsWith('/')) return `${englishMaterialsOrigin}${raw}`;
            return `${englishMaterialsOrigin}/${raw.replace(/^\/+/, '')}`;
        };

        const isAllowedMaterialsUrl = (value) => {
            try {
                const u = new URL(value);
                return u.hostname === 'www.englearner.site' || u.hostname.endsWith('.englearner.site') || u.hostname === 'englearner.site';
            } catch {
                return false;
            }
        };

        const getCurrentMaterialsUrl = () => {
            if (materialsIframe && materialsIframe.tagName === 'IFRAME') {
                const raw = String(materialsIframe.getAttribute('src') || materialsIframe.src || '').trim();
                return raw || englishMaterialsBaseUrl;
            }
            return englishMaterialsBaseUrl;
        };

        const navigateMaterials = (rawUrl) => {
            const url = normalizeMaterialsUrl(rawUrl);
            if (!isAllowedMaterialsUrl(url)) {
                window.open(url, '_blank', 'noopener,noreferrer');
                return;
            }
            if (materialsIframe && materialsIframe.tagName === 'IFRAME') {
                materialsIframe.src = url;
            }
        };

        document.querySelectorAll('[data-materials-url]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.currentTarget.getAttribute('data-materials-url');
                if (!url) return;
                navigateMaterials(url);
            });
        });

        document.getElementById('englishMaterialsOpenBtn')?.addEventListener('click', () => {
            const url = normalizeMaterialsUrl(getCurrentMaterialsUrl());
            window.open(url, '_blank', 'noopener,noreferrer');
        });

        document.getElementById('englishMaterialsCopyBtn')?.addEventListener('click', async () => {
            const url = normalizeMaterialsUrl(getCurrentMaterialsUrl());
            try {
                await navigator.clipboard.writeText(url);
            } catch {
                prompt('复制下面链接：', url);
            }
        });

        // 日历控制
        document.getElementById('prevMonth')?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.renderCalendar();
        });

        document.getElementById('nextMonth')?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.renderCalendar();
        });

        // 今日按钮
        document.getElementById('goToToday')?.addEventListener('click', () => {
            this.goToToday();
        });

        // 日程管理
        document.getElementById('addSchedule')?.addEventListener('click', () => {
            this.showScheduleModal();
        });

        document.getElementById('closeModal')?.addEventListener('click', () => {
            this.hideScheduleModal();
        });

        document.getElementById('cancelSchedule')?.addEventListener('click', () => {
            this.hideScheduleModal();
        });

        document.getElementById('scheduleForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSchedule();
        });

        // 批量模式切换
        document.getElementById('batchMode')?.addEventListener('change', (e) => {
            const batchContainer = document.getElementById('batchSchedulesContainer');
            if (batchContainer) {
                batchContainer.style.display = e.target.checked ? 'block' : 'none';
            }
        });

        // 点击模态框外部关闭
        document.getElementById('scheduleModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'scheduleModal') {
                this.hideScheduleModal();
            }
        });
        
        // 学习计划事件监听器
        document.getElementById('addLearningPlan')?.addEventListener('click', () => {
            this.showLearningPlanModal();
        });

        // 导出学习计划按钮
        const exportLearningBtn = document.getElementById('exportLearningPlansBtn');
        if (exportLearningBtn) {
            exportLearningBtn.addEventListener('click', () => {
                this.exportLearningPlans();
            });
        }

        // 导入学习计划按钮
        const importLearningBtn = document.getElementById('importLearningPlansBtn');
        const importLearningFile = document.getElementById('importLearningPlansFile');
        if (importLearningBtn && importLearningFile) {
            importLearningBtn.addEventListener('click', () => {
                importLearningFile.click();
            });
            
            importLearningFile.addEventListener('change', (e) => {
                this.importLearningPlans(e);
            });
        }
        
        document.getElementById('closeLearningPlanModal')?.addEventListener('click', () => {
            this.hideLearningPlanModal();
        });
        
        document.getElementById('cancelLearningPlan')?.addEventListener('click', () => {
            this.hideLearningPlanModal();
        });
        
        document.getElementById('learningPlanForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveLearningPlan();
        });

        document.getElementById('planBatchMode')?.addEventListener('change', (e) => {
            this.togglePlanBatchMode(e.target.checked);
        });
        
        // 点击模态框外部关闭
        document.getElementById('learningPlanModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'learningPlanModal') {
                this.hideLearningPlanModal();
            }
        });
        
        // 清单系统事件监听器
        const addChecklistBtn = document.getElementById('addChecklistTaskBtn');
        if (addChecklistBtn) {
            addChecklistBtn.addEventListener('click', () => {
                this.showSystem('todo-calendar');
                if (this.todoCalendarInstance?.openScheduleModal) {
                    this.todoCalendarInstance.openScheduleModal();
                }
            });
        }
        
        const closeChecklistModalBtn = document.getElementById('closeChecklistModal');
        if (closeChecklistModalBtn) {
            closeChecklistModalBtn.addEventListener('click', () => {
                this.hideChecklistModal();
            });
        }
        
        const cancelChecklistBtn = document.getElementById('cancelChecklist');
        if (cancelChecklistBtn) {
            cancelChecklistBtn.addEventListener('click', () => {
                this.hideChecklistModal();
            });
        }
        
        const checklistForm = document.getElementById('checklistForm');
        if (checklistForm) {
            checklistForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveChecklistTask();
            });
        }
        
        const checklistModal = document.getElementById('checklistModal');
        if (checklistModal) {
            checklistModal.addEventListener('click', (e) => {
                if (e.target.id === 'checklistModal') {
                    this.hideChecklistModal();
                }
            });
        }
        
        // 时间模式切换
        document.querySelectorAll('input[name="timeMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.toggleTimeMode(e.target.value);
            });
        });
        
        // 时长选择器
        document.getElementById('planDuration')?.addEventListener('change', (e) => {
            this.toggleCustomDuration(e.target.value);
        });
        
        // 重复类型切换
        document.querySelectorAll('input[name="recurrenceType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.toggleRecurrenceType(e.target.value);
            });
        });

        // 还款计划按钮事件监听器
        document.getElementById('recordPaymentBtn')?.addEventListener('click', () => {
            // 记录还款按钮点击事件
            // 由于表格行中的按钮已经有onclick事件，这里可以作为备用或批量操作入口
            const selectedRows = document.querySelectorAll('.repayment-plan-row.selected');
            if (selectedRows.length > 0) {
                // 如果有选中的行，可以实现批量还款功能
                alert('批量还款功能开发中');
            } else {
                alert('请选择要记录还款的计划');
            }
        });

        document.getElementById('prepaymentBtn')?.addEventListener('click', () => {
            // 提前还款按钮点击事件
            const selectedRows = document.querySelectorAll('.repayment-plan-row.selected');
            if (selectedRows.length > 0) {
                // 如果有选中的行，可以实现批量提前还款功能
                alert('批量提前还款功能开发中');
            } else {
                alert('请选择要提前还款的计划');
            }
        });
    }

    setupTooltips() {
        const tooltip = document.createElement('div');
        tooltip.className = 'ui-tooltip-bubble';
        document.body.appendChild(tooltip);

        let activeEl = null;
        let hideTimer = null;

        const positionTooltip = () => {
            if (!activeEl) return;
            const rect = activeEl.getBoundingClientRect();
            tooltip.style.left = '0px';
            tooltip.style.top = '0px';
            const tipRect = tooltip.getBoundingClientRect();

            const gap = 10;
            const left = Math.min(Math.max(12, rect.left + rect.width / 2 - tipRect.width / 2), window.innerWidth - tipRect.width - 12);
            const topPreferred = rect.top - tipRect.height - gap;
            const top = topPreferred >= 12 ? topPreferred : Math.min(rect.bottom + gap, window.innerHeight - tipRect.height - 12);

            tooltip.style.left = `${Math.round(left)}px`;
            tooltip.style.top = `${Math.round(top)}px`;
        };

        const showFor = (el) => {
            const text = el?.getAttribute?.('data-tooltip');
            if (!text) return;

            if (hideTimer) {
                window.clearTimeout(hideTimer);
                hideTimer = null;
            }

            activeEl = el;
            tooltip.textContent = text;
            positionTooltip();
            tooltip.classList.add('is-visible');
        };

        const hide = () => {
            activeEl = null;
            tooltip.classList.remove('is-visible');
        };

        document.addEventListener('pointerover', (e) => {
            const el = e.target.closest?.('[data-tooltip]');
            if (!el) return;
            showFor(el);
        }, { passive: true });

        document.addEventListener('pointerout', (e) => {
            const leavingFrom = e.target.closest?.('[data-tooltip]');
            if (!leavingFrom) return;
            const toEl = e.relatedTarget && e.relatedTarget.closest?.('[data-tooltip]');
            if (toEl === leavingFrom) return;
            hideTimer = window.setTimeout(hide, 60);
        }, { passive: true });

        document.addEventListener('focusin', (e) => {
            const el = e.target.closest?.('[data-tooltip]');
            if (!el) return;
            showFor(el);
        });

        document.addEventListener('focusout', (e) => {
            const leavingFrom = e.target.closest?.('[data-tooltip]');
            if (!leavingFrom) return;
            hide();
        });

        window.addEventListener('scroll', hide, { passive: true });
        window.addEventListener('resize', () => {
            if (!activeEl) return;
            positionTooltip();
        }, { passive: true });
    }

    // 显示系统
    showSystem(system) {
        // 更新导航状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-system="${system}"]`)?.classList.add('active');

        this.currentSystem = system;

        // 系统特定的初始化
        if (system === 'overview') {
            this.hideAllModules();
            document.getElementById('overview')?.classList.add('active');
            this.updateOverviewStats();
            return;
        }
        if (system === 'learning') {
            // 显示学习系统主页，隐藏其他系统模块
            this.hideAllModules();
            document.getElementById('learning')?.classList.add('active');
            this.showLearningHome();
        } else if (system === 'finance') {
            // 显示财务系统主页，隐藏其他系统模块
            this.hideAllModules();
            document.getElementById('finance')?.classList.add('active');
            this.showFinanceHome();
        } else if (system === 'life') {
            this.hideAllModules();
            document.getElementById('life')?.classList.add('active');
            this.showLifeHome();
        } else if (system === 'checklist') {
            // 显示清单系统
            this.hideAllModules();
            document.getElementById('checklist')?.classList.add('active');
            this.renderChecklist();
            this.updateChecklistStats();
        } else if (system === 'todo-calendar') {
            this.hideAllModules();
            document.getElementById('todo-calendar')?.classList.add('active');
            if (!this.todoCalendarInstance) {
                this.todoCalendarInstance = new TodoCalendar();
            } else {
                if (this.todoCalendarInstance.reloadSchedules) {
                    this.todoCalendarInstance.reloadSchedules();
                } else {
                    this.todoCalendarInstance.renderCalendar();
                    this.todoCalendarInstance.updateSelectedDateInfo();
                }
            }
        } else {
            // 对于其他系统，确保隐藏所有学习模块和财务模块
            this.hideAllModules();
            document.getElementById(system)?.classList.add('active');
        }
    }

    // 隐藏所有模块
    hideAllModules() {
        // 隐藏学习系统模块
        const learningHome = document.getElementById('learningHome');
        if (learningHome) learningHome.style.display = 'none';
        const todoCalendarModule = document.getElementById('todoCalendarModule');
        if (todoCalendarModule) todoCalendarModule.style.display = 'none';
        const learningPlanModule = document.getElementById('learningPlanModule');
        if (learningPlanModule) learningPlanModule.style.display = 'none';
        
        // 隐藏财务系统模块
        const financeHome = document.getElementById('financeHome');
        if (financeHome) financeHome.style.display = 'none';
        document.querySelectorAll('.finance-module-page').forEach(page => {
            page.style.display = 'none';
            page.classList.remove('show-module');
        });

        const lifeHome = document.getElementById('lifeHome');
        if (lifeHome) lifeHome.style.display = 'none';
        document.querySelectorAll('.life-module-page').forEach(page => {
            page.style.display = 'none';
            page.classList.remove('show-module');
        });
        
        // 隐藏所有学习模块页面
        document.querySelectorAll('.learning-module-page').forEach(page => {
            page.style.display = 'none';
            page.classList.remove('show-module');
        });
        
        // 隐藏所有系统模块内容
        document.querySelectorAll('.system-section').forEach(section => {
            section.classList.remove('active');
        });
        
        // 隐藏所有模态框
        this.hideLearningPlanModal();
        this.hideScheduleModal();
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    // 显示学习系统主页
    showLearningHome() {
        const learningHome = document.getElementById('learningHome');
        if (learningHome) learningHome.style.display = 'block';
        document.querySelectorAll('.learning-module-page').forEach(page => {
            page.style.display = 'none';
            page.classList.remove('show-module');
        });
        this.hideLearningPlanModal();
        this.updateTodayInfo();
        this.updateModuleStats();
    }

    showLifeHome() {
        const lifeHome = document.getElementById('lifeHome');
        if (lifeHome) lifeHome.style.display = 'block';
        document.querySelectorAll('.life-module-page').forEach(page => {
            page.style.display = 'none';
            page.classList.remove('show-module');
        });
        this.updateMetamorphosisModuleStats();
        this.updateSleepRoutineModuleStats();
        this.updateLifeSleepQualityCard();
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.scrollTop = 0;
    }

    showLifeModule(module) {
        if (this.currentSystem !== 'life') {
            this.showSystem('life');
            window.requestAnimationFrame(() => this.showLifeModule(module));
            return;
        }

        const lifeHome = document.getElementById('lifeHome');
        if (lifeHome) {
            lifeHome.style.display = 'none';
            lifeHome.classList.remove('show-module');
        }

        document.querySelectorAll('.life-module-page').forEach(page => {
            page.style.display = 'none';
            page.classList.remove('show-module');
        });

        if (module === 'metamorphosis') {
            const moduleElement = document.getElementById('metamorphosisModule');
            if (moduleElement) {
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
                this.openMetamorphosisModule();
            }
        }

        if (module === 'sleepRoutine') {
            const moduleElement = document.getElementById('sleepRoutineModule');
            if (moduleElement) {
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
                this.openSleepRoutineModule();
            }
        }

        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.scrollTop = 0;
    }

    formatSleepRoutineDateKey(date) {
        const d = date instanceof Date ? date : new Date(date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    parseTimeToMinutes(value) {
        const raw = String(value || '').trim();
        const m = raw.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return hh * 60 + mm;
    }

    formatMinutesToTime(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '--:--';
        const total = ((Math.round(n) % (24 * 60)) + (24 * 60)) % (24 * 60);
        const hh = String(Math.floor(total / 60)).padStart(2, '0');
        const mm = String(total % 60).padStart(2, '0');
        return `${hh}:${mm}`;
    }

    normalizeSleepRoutineData(raw) {
        const now = new Date().toISOString();
        const safe = raw && typeof raw === 'object' ? raw : {};
        const records = (safe.records && typeof safe.records === 'object') ? safe.records : {};
        const targetBedtime = typeof safe.settings?.targetBedtime === 'string' ? safe.settings.targetBedtime : '23:00';
        const scheduleRaw = typeof safe.settings?.checkinSchedule === 'string' ? safe.settings.checkinSchedule : '';
        const checkinSchedule = scheduleRaw === 'workday' ? 'workday' : 'daily';
        const targetLocked = Boolean(safe.settings?.targetLocked);
        return {
            version: 1,
            createdAt: safe.createdAt || now,
            updatedAt: now,
            settings: {
                targetBedtime: /^\d{1,2}:\d{2}$/.test(targetBedtime) ? targetBedtime : '23:00',
                checkinSchedule,
                targetLocked
            },
            records
        };
    }

    getDefaultSleepRoutineData() {
        return this.normalizeSleepRoutineData({
            settings: { targetBedtime: '23:00' },
            records: {}
        });
    }

    loadSleepRoutineData() {
        try {
            const raw = localStorage.getItem('md_sleep_routine');
            if (!raw) return this.getDefaultSleepRoutineData();
            const parsed = JSON.parse(raw);
            return this.normalizeSleepRoutineData(parsed);
        } catch {
            return this.getDefaultSleepRoutineData();
        }
    }

    saveSleepRoutineData() {
        try {
            this.sleepRoutineData.updatedAt = new Date().toISOString();
            localStorage.setItem('md_sleep_routine', JSON.stringify(this.sleepRoutineData));
        } catch (e) {
            console.error(e);
        }
    }

    computeSleepDurationMinutes(bedtime, wakeTime) {
        const bed = this.parseTimeToMinutes(bedtime);
        const wake = this.parseTimeToMinutes(wakeTime);
        if (bed === null || wake === null) return null;
        let end = wake;
        if (end <= bed) end += 24 * 60;
        const duration = end - bed;
        if (duration <= 0 || duration > 20 * 60) return null;
        return duration;
    }

    isOnTimeBedtime(bedtime, targetBedtime) {
        const bed = this.parseTimeToMinutes(bedtime);
        const target = this.parseTimeToMinutes(targetBedtime);
        if (bed === null || target === null) return null;
        return bed <= target;
    }

    getSleepRoutineRecord(dateKey) {
        const key = String(dateKey || '').trim();
        if (!key) return null;
        const rec = this.sleepRoutineData?.records?.[key];
        if (!rec || typeof rec !== 'object') return null;
        return rec;
    }

    upsertSleepRoutineRecord(dateKey, record) {
        const key = String(dateKey || '').trim();
        if (!key) return;
        const safe = record && typeof record === 'object' ? record : {};
        const prev = this.getSleepRoutineRecord(key) || {};
        const next = {
            bedtime: typeof safe.bedtime === 'string' ? safe.bedtime : (typeof prev.bedtime === 'string' ? prev.bedtime : ''),
            wakeTime: typeof safe.wakeTime === 'string' ? safe.wakeTime : (typeof prev.wakeTime === 'string' ? prev.wakeTime : ''),
            createdAt: prev.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (!this.sleepRoutineData.records || typeof this.sleepRoutineData.records !== 'object') {
            this.sleepRoutineData.records = {};
        }
        this.sleepRoutineData.records[key] = next;
        this.saveSleepRoutineData();
    }

    deleteSleepRoutineRecord(dateKey) {
        const key = String(dateKey || '').trim();
        if (!key) return;
        if (this.sleepRoutineData?.records?.[key]) {
            delete this.sleepRoutineData.records[key];
            this.saveSleepRoutineData();
        }
    }

    computeSleepRoutineStats(days = 7) {
        const n = Math.max(1, Math.min(60, Number(days) || 7));
        const targetBedtime = this.sleepRoutineData?.settings?.targetBedtime || '23:00';
        const schedule = this.sleepRoutineData?.settings?.checkinSchedule === 'workday' ? 'workday' : 'daily';
        const todayKey = this.formatSleepRoutineDateKey(new Date());

        const isWorkday = (date) => {
            const d = date instanceof Date ? date : new Date(date);
            const day = d.getDay();
            return day >= 1 && day <= 5;
        };

        const buildRecentKeys = () => {
            const out = [];
            let cursor = new Date(`${todayKey}T00:00:00`);
            let guard = 0;
            while (out.length < n && guard < 370) {
                if (schedule === 'daily' || isWorkday(cursor)) {
                    out.push(this.formatSleepRoutineDateKey(cursor));
                }
                cursor = this.addDays(cursor, -1);
                guard += 1;
            }
            return out;
        };

        const recentKeys = [];
        buildRecentKeys().forEach(k => recentKeys.push(k));

        let durationSum = 0;
        let durationCount = 0;
        let wakeSum = 0;
        let wakeCount = 0;
        let bedtimeCount = 0;
        let onTimeCount = 0;

        const qualifies = (rec) => {
            if (!rec) return false;
            const onTime = this.isOnTimeBedtime(rec.bedtime, targetBedtime);
            const duration = this.computeSleepDurationMinutes(rec.bedtime, rec.wakeTime);
            return onTime === true && duration !== null;
        };

        recentKeys.forEach((k) => {
            const rec = this.getSleepRoutineRecord(k);
            if (!rec) return;
            const duration = this.computeSleepDurationMinutes(rec.bedtime, rec.wakeTime);
            if (duration !== null) {
                durationSum += duration;
                durationCount += 1;
            }
            const wake = this.parseTimeToMinutes(rec.wakeTime);
            if (wake !== null) {
                wakeSum += wake;
                wakeCount += 1;
            }
            const onTime = this.isOnTimeBedtime(rec.bedtime, targetBedtime);
            if (onTime !== null) {
                bedtimeCount += 1;
                if (onTime) onTimeCount += 1;
            }
        });

        let currentStreak = 0;
        {
            let cursor = new Date(`${todayKey}T00:00:00`);
            let guard = 0;
            while (guard < 370) {
                if (schedule === 'workday' && !isWorkday(cursor)) {
                    cursor = this.addDays(cursor, -1);
                    guard += 1;
                    continue;
                }
                const k = this.formatSleepRoutineDateKey(cursor);
                const rec = this.getSleepRoutineRecord(k);
                if (!qualifies(rec)) break;
                currentStreak += 1;
                cursor = this.addDays(cursor, -1);
                guard += 1;
            }
        }

        const allKeys = Object.keys(this.sleepRoutineData?.records || {}).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        let bestStreak = 0;
        let run = 0;
        let lastKey = '';
        const nextExpectedKey = (key) => {
            const d = new Date(`${key}T00:00:00`);
            if (schedule === 'daily') return this.formatSleepRoutineDateKey(this.addDays(d, 1));
            let cursor = this.addDays(d, 1);
            let guard = 0;
            while (guard < 10) {
                if (isWorkday(cursor)) return this.formatSleepRoutineDateKey(cursor);
                cursor = this.addDays(cursor, 1);
                guard += 1;
            }
            return this.formatSleepRoutineDateKey(cursor);
        };
        allKeys.forEach((k) => {
            if (schedule === 'workday') {
                const d = new Date(`${k}T00:00:00`);
                if (!isWorkday(d)) return;
            }
            const rec = this.getSleepRoutineRecord(k);
            const ok = qualifies(rec);
            if (!ok) {
                run = 0;
                lastKey = k;
                return;
            }
            if (!lastKey) {
                run = 1;
                bestStreak = Math.max(bestStreak, run);
                lastKey = k;
                return;
            }
            const prevDate = new Date(`${lastKey}T00:00:00`);
            const nextExpected = nextExpectedKey(this.formatSleepRoutineDateKey(prevDate));
            if (k === nextExpected) {
                run += 1;
            } else {
                run = 1;
            }
            bestStreak = Math.max(bestStreak, run);
            lastKey = k;
        });

        return {
            targetBedtime,
            avgDurationMinutes: durationCount ? (durationSum / durationCount) : null,
            avgWakeMinutes: wakeCount ? (wakeSum / wakeCount) : null,
            onTimeRate: bedtimeCount ? (onTimeCount / bedtimeCount) : null,
            currentStreak,
            bestStreak
        };
    }

    updateLifeSleepQualityCard() {
        const stats = this.computeSleepRoutineStats(7);
        const valueEl = document.getElementById('lifeSleepQualityValue');
        const labelEl = document.getElementById('lifeSleepQualityLabel');
        const schedule = this.sleepRoutineData?.settings?.checkinSchedule === 'workday' ? 'workday' : 'daily';
        if (labelEl) labelEl.textContent = schedule === 'workday' ? '近7个工作日平均睡眠时长' : '近7天平均睡眠时长';
        if (!valueEl) return;
        if (stats.avgDurationMinutes === null) {
            valueEl.textContent = '0h';
            return;
        }
        const hours = stats.avgDurationMinutes / 60;
        valueEl.textContent = `${hours.toFixed(1)}h`;
    }

    updateSleepRoutineModuleStats() {
        const stats = this.computeSleepRoutineStats(7);
        const targetEl = document.getElementById('sleepRoutineTargetBedtimeStat');
        if (targetEl) targetEl.textContent = stats.targetBedtime || '--:--';
        const streakEl = document.getElementById('sleepRoutineCurrentStreakStat');
        if (streakEl) streakEl.textContent = String(stats.currentStreak || 0);
    }

    openSleepRoutineModule() {
        if (this.sleepRoutineEventsBound) {
            this.renderSleepRoutineModule();
            return;
        }
        this.sleepRoutineEventsBound = true;

        const targetInput = document.getElementById('sleepRoutineTargetBedtime');
        const dateInput = document.getElementById('sleepRoutineDate');
        const scheduleEl = document.getElementById('sleepRoutineCheckinSchedule');
        const saveTargetBtn = document.getElementById('sleepRoutineSaveTargetBtn');
        const bedInput = document.getElementById('sleepRoutineBedtimeInput');
        const wakeInput = document.getElementById('sleepRoutineWakeInput');
        const bedNowBtn = document.getElementById('sleepRoutineBedtimeNowBtn');
        const wakeNowBtn = document.getElementById('sleepRoutineWakeNowBtn');
        const saveRecordBtn = document.getElementById('sleepRoutineSaveRecordBtn');
        const deleteRecordBtn = document.getElementById('sleepRoutineDeleteRecordBtn');
        const recordsBody = document.getElementById('sleepRoutineRecordsBody');

        const getSelectedDateKey = () => {
            const raw = String(dateInput?.value || '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
            return this.formatSleepRoutineDateKey(new Date());
        };

        const setTimeInputNow = (el) => {
            if (!el) return;
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            el.value = `${hh}:${mm}`;
        };

        const loadDayToInputs = () => {
            const key = getSelectedDateKey();
            const rec = this.getSleepRoutineRecord(key);
            if (bedInput) bedInput.value = rec?.bedtime || '';
            if (wakeInput) wakeInput.value = rec?.wakeTime || '';
            this.renderSleepRoutineHints();
        };

        saveTargetBtn?.addEventListener('click', () => {
            if (this.sleepRoutineData?.settings?.targetLocked) return;
            const value = String(targetInput?.value || '').trim();
            if (!/^\d{1,2}:\d{2}$/.test(value)) return;
            this.sleepRoutineData.settings.targetBedtime = value;
            this.sleepRoutineData.settings.targetLocked = true;
            this.saveSleepRoutineData();
            this.updateSleepRoutineModuleStats();
            this.updateLifeSleepQualityCard();
            this.renderSleepRoutineModule();
        });

        scheduleEl?.addEventListener('change', () => {
            const next = scheduleEl.value === 'workday' ? 'workday' : 'daily';
            this.sleepRoutineData.settings.checkinSchedule = next;
            this.saveSleepRoutineData();
            this.updateSleepRoutineModuleStats();
            this.updateLifeSleepQualityCard();
            this.renderSleepRoutineModule();
        });

        dateInput?.addEventListener('change', () => {
            loadDayToInputs();
        });

        bedNowBtn?.addEventListener('click', () => {
            setTimeInputNow(bedInput);
            this.renderSleepRoutineHints();
        });

        wakeNowBtn?.addEventListener('click', () => {
            setTimeInputNow(wakeInput);
            this.renderSleepRoutineHints();
        });

        const saveDayRecord = () => {
            const key = getSelectedDateKey();
            const bedtime = String(bedInput?.value || '').trim();
            const wakeTime = String(wakeInput?.value || '').trim();
            this.upsertSleepRoutineRecord(key, { bedtime, wakeTime });
            this.updateSleepRoutineModuleStats();
            this.updateLifeSleepQualityCard();
            this.renderSleepRoutineModule();
        };

        saveRecordBtn?.addEventListener('click', saveDayRecord);

        deleteRecordBtn?.addEventListener('click', () => {
            const key = getSelectedDateKey();
            if (!this.getSleepRoutineRecord(key)) return;
            if (!confirm('确定删除该日期的记录吗？')) return;
            this.deleteSleepRoutineRecord(key);
            loadDayToInputs();
            this.updateSleepRoutineModuleStats();
            this.updateLifeSleepQualityCard();
            this.renderSleepRoutineModule();
        });

        recordsBody?.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('[data-sleep-delete]');
            if (!btn) return;
            const key = btn.getAttribute('data-sleep-delete') || '';
            if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
            if (!confirm('确定删除该条记录吗？')) return;
            this.deleteSleepRoutineRecord(key);
            const selected = getSelectedDateKey();
            if (selected === key) loadDayToInputs();
            this.updateSleepRoutineModuleStats();
            this.updateLifeSleepQualityCard();
            this.renderSleepRoutineModule();
        });

        this.renderSleepRoutineModule();
        loadDayToInputs();
    }

    renderSleepRoutineHints() {
        const hintEl = document.getElementById('sleepRoutineTodayHint');
        const badgeEl = document.getElementById('sleepRoutineTodayBadge');
        if (!hintEl && !badgeEl) return;

        const target = this.sleepRoutineData?.settings?.targetBedtime || '23:00';
        const key = String(document.getElementById('sleepRoutineDate')?.value || '').trim() || this.formatSleepRoutineDateKey(new Date());
        const bed = String(document.getElementById('sleepRoutineBedtimeInput')?.value || '').trim();
        const wake = String(document.getElementById('sleepRoutineWakeInput')?.value || '').trim();

        const onTime = this.isOnTimeBedtime(bed, target);
        const duration = this.computeSleepDurationMinutes(bed, wake);

        const parts = [];
        parts.push(`目标睡觉时间：${target}`);
        parts.push(`日期：${key}`);
        if (bed) parts.push(`入睡：${bed}${onTime === null ? '' : (onTime ? '（早睡达标）' : '（晚于目标）')}`);
        if (wake) parts.push(`起床：${wake}`);
        if (duration !== null) parts.push(`睡眠时长：${(duration / 60).toFixed(1)}h`);

        if (hintEl) hintEl.textContent = parts.join(' · ');

        if (badgeEl) {
            if (onTime === true && duration !== null) {
                badgeEl.textContent = '合格';
            } else if (bed || wake) {
                badgeEl.textContent = '未完成';
            } else {
                badgeEl.textContent = '';
            }
        }
    }

    renderSleepRoutineModule() {
        const targetInput = document.getElementById('sleepRoutineTargetBedtime');
        if (targetInput) {
            targetInput.value = this.sleepRoutineData?.settings?.targetBedtime || '23:00';
        }

        const scheduleEl = document.getElementById('sleepRoutineCheckinSchedule');
        if (scheduleEl) {
            scheduleEl.value = this.sleepRoutineData?.settings?.checkinSchedule === 'workday' ? 'workday' : 'daily';
        }

        const locked = Boolean(this.sleepRoutineData?.settings?.targetLocked);
        const saveTargetBtn = document.getElementById('sleepRoutineSaveTargetBtn');
        if (targetInput) targetInput.disabled = locked;
        if (saveTargetBtn) saveTargetBtn.disabled = locked;

        const dateInput = document.getElementById('sleepRoutineDate');
        if (dateInput && !dateInput.value) {
            dateInput.value = this.formatSleepRoutineDateKey(new Date());
        }

        const targetHint = document.getElementById('sleepRoutineTargetHint');
        if (targetHint) {
            const stats = this.computeSleepRoutineStats(7);
            const onTimeRate = stats.onTimeRate === null ? '--' : `${Math.round(stats.onTimeRate * 100)}%`;
            targetHint.textContent = `近7天早睡达标率：${onTimeRate} · 当前连胜：${stats.currentStreak} 天 · 最长连胜：${stats.bestStreak} 天`;
        }

        const stats = this.computeSleepRoutineStats(7);
        const avgEl = document.getElementById('sleepRoutineAvgDuration');
        const avgLabelEl = document.getElementById('sleepRoutineAvgDurationLabel');
        const schedule = this.sleepRoutineData?.settings?.checkinSchedule === 'workday' ? 'workday' : 'daily';
        if (avgLabelEl) avgLabelEl.textContent = schedule === 'workday' ? '近7个工作日' : '近7天';
        if (avgEl) {
            avgEl.textContent = stats.avgDurationMinutes === null ? '0h' : `${(stats.avgDurationMinutes / 60).toFixed(1)}h`;
        }
        const rateEl = document.getElementById('sleepRoutineOnTimeRate');
        if (rateEl) {
            rateEl.textContent = stats.onTimeRate === null ? '0%' : `${Math.round(stats.onTimeRate * 100)}%`;
        }
        const wakeEl = document.getElementById('sleepRoutineAvgWake');
        if (wakeEl) {
            wakeEl.textContent = stats.avgWakeMinutes === null ? '--:--' : this.formatMinutesToTime(stats.avgWakeMinutes);
        }
        const streakEl = document.getElementById('sleepRoutineCurrentStreak');
        if (streakEl) streakEl.textContent = String(stats.currentStreak || 0);

        this.updateSleepRoutineModuleStats();

        const selectedKey = String(document.getElementById('sleepRoutineDate')?.value || '').trim() || this.formatSleepRoutineDateKey(new Date());
        const rec = this.getSleepRoutineRecord(selectedKey);
        const bedInput = document.getElementById('sleepRoutineBedtimeInput');
        const wakeInput = document.getElementById('sleepRoutineWakeInput');
        if (bedInput && (bedInput.value || '') === '' && rec?.bedtime) bedInput.value = rec.bedtime;
        if (wakeInput && (wakeInput.value || '') === '' && rec?.wakeTime) wakeInput.value = rec.wakeTime;

        const body = document.getElementById('sleepRoutineRecordsBody');
        if (body) {
            const keys = Object.keys(this.sleepRoutineData?.records || {}).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().reverse().slice(0, 14);
            const target = this.sleepRoutineData?.settings?.targetBedtime || '23:00';
            body.innerHTML = keys.map((k) => {
                const r = this.getSleepRoutineRecord(k) || {};
                const duration = this.computeSleepDurationMinutes(r.bedtime, r.wakeTime);
                const onTime = this.isOnTimeBedtime(r.bedtime, target);
                const durationText = duration === null ? '--' : `${(duration / 60).toFixed(1)}h`;
                const onTimeText = onTime === null ? '--' : (onTime ? '是' : '否');
                return `
                    <tr>
                        <td>${k}</td>
                        <td>${r.bedtime ? r.bedtime : '--:--'}</td>
                        <td>${r.wakeTime ? r.wakeTime : '--:--'}</td>
                        <td>${durationText}</td>
                        <td>${onTimeText}</td>
                        <td>
                            <button type="button" class="btn btn-outline btn-sm" data-sleep-delete="${k}">
                                <i class="fas fa-trash"></i> 删除
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        this.renderSleepRoutineHints();
    }

    formatMetamorphosisDateKey(date) {
        const d = date instanceof Date ? date : new Date(date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    addDays(date, days) {
        const d = date instanceof Date ? new Date(date) : new Date(date);
        d.setDate(d.getDate() + Number(days || 0));
        return d;
    }

    normalizeMetamorphosisData(raw) {
        const now = new Date().toISOString();
        const safe = raw && typeof raw === 'object' ? raw : {};
        const checkins = (safe.checkins && typeof safe.checkins === 'object') ? safe.checkins : {};

        const theme = safe.theme === 'tree' ? 'tree' : 'mountain';
        const targetDays = Math.max(1, Number(safe.targetDays || 7) || 7);

        return {
            version: 1,
            createdAt: safe.createdAt || now,
            updatedAt: now,
            theme,
            targetDays,
            checkins,
            stats: {
                successCount: Number(safe.stats?.successCount || 0) || 0,
                setbackCount: Number(safe.stats?.setbackCount || 0) || 0,
                bestStreak: Number(safe.stats?.bestStreak || 0) || 0,
                pornSuccessCount: Number(safe.stats?.pornSuccessCount || 0) || 0,
                pornSetbackCount: Number(safe.stats?.pornSetbackCount || 0) || 0,
                masturbationSuccessCount: Number(safe.stats?.masturbationSuccessCount || 0) || 0,
                masturbationSetbackCount: Number(safe.stats?.masturbationSetbackCount || 0) || 0
            }
        };
    }

    getDefaultMetamorphosisData() {
        return this.normalizeMetamorphosisData({
            theme: 'mountain',
            targetDays: 7,
            checkins: {},
            stats: {
                successCount: 0,
                setbackCount: 0,
                bestStreak: 0,
                pornSuccessCount: 0,
                pornSetbackCount: 0,
                masturbationSuccessCount: 0,
                masturbationSetbackCount: 0
            }
        });
    }

    loadMetamorphosisData() {
        try {
            const saved = localStorage.getItem('selfSystemMetamorphosisData');
            if (!saved) return this.getDefaultMetamorphosisData();
            return this.normalizeMetamorphosisData(JSON.parse(saved));
        } catch (error) {
            console.error('加载蜕变数据失败:', error);
            return this.getDefaultMetamorphosisData();
        }
    }

    saveMetamorphosisData() {
        try {
            if (!this.metamorphosisData) this.metamorphosisData = this.getDefaultMetamorphosisData();
            this.metamorphosisData.updatedAt = new Date().toISOString();
            localStorage.setItem('selfSystemMetamorphosisData', JSON.stringify(this.metamorphosisData));
        } catch (error) {
            console.error('保存蜕变数据失败:', error);
        }
    }

    recomputeMetamorphosisAggregates() {
        const data = this.metamorphosisData || this.getDefaultMetamorphosisData();
        const checkins = (data.checkins && typeof data.checkins === 'object') ? data.checkins : {};
        const keys = Object.keys(checkins).filter(Boolean).sort();

        let successCount = 0;
        let setbackCount = 0;
        let pornSuccessCount = 0;
        let pornSetbackCount = 0;
        let masturbationSuccessCount = 0;
        let masturbationSetbackCount = 0;
        let bestStreak = 0;
        let rollingStreak = 0;
        let lastDateKey = '';

        const parseKey = (key) => {
            const [y, m, d] = String(key).split('-').map(n => Number(n));
            if (!y || !m || !d) return null;
            return new Date(y, m - 1, d);
        };

        const isConsecutive = (prevKey, nextKey) => {
            const prev = parseKey(prevKey);
            const next = parseKey(nextKey);
            if (!prev || !next) return false;
            const diffDays = Math.round((next - prev) / 86400000);
            return diffDays === 1;
        };

        keys.forEach((dateKey) => {
            const entry = checkins[dateKey] || {};
            const porn = entry.porn === 'setback' ? 'setback' : 'success';
            const masturbation = entry.masturbation === 'setback' ? 'setback' : 'success';
            const overall = entry.overall === 'setback' ? 'setback' : (porn === 'success' && masturbation === 'success' ? 'success' : 'setback');

            if (porn === 'success') pornSuccessCount += 1;
            else pornSetbackCount += 1;
            if (masturbation === 'success') masturbationSuccessCount += 1;
            else masturbationSetbackCount += 1;

            if (overall === 'success') {
                successCount += 1;
                if (lastDateKey && isConsecutive(lastDateKey, dateKey)) {
                    rollingStreak += 1;
                } else {
                    rollingStreak = 1;
                }
                bestStreak = Math.max(bestStreak, rollingStreak);
            } else {
                setbackCount += 1;
                rollingStreak = 0;
            }

            lastDateKey = dateKey;
        });

        const todayKey = this.formatMetamorphosisDateKey(new Date());
        let currentStreak = 0;
        let cursor = new Date();
        while (true) {
            const key = this.formatMetamorphosisDateKey(cursor);
            const entry = checkins[key];
            if (!entry) break;
            const porn = entry.porn === 'setback' ? 'setback' : 'success';
            const masturbation = entry.masturbation === 'setback' ? 'setback' : 'success';
            const overall = entry.overall === 'setback' ? 'setback' : (porn === 'success' && masturbation === 'success' ? 'success' : 'setback');
            if (overall !== 'success') break;
            currentStreak += 1;
            cursor = this.addDays(cursor, -1);
        }

        data.stats = {
            successCount,
            setbackCount,
            bestStreak,
            pornSuccessCount,
            pornSetbackCount,
            masturbationSuccessCount,
            masturbationSetbackCount
        };
        data.currentStreak = currentStreak;
        data.lastCheckinDate = checkins[todayKey] ? todayKey : (data.lastCheckinDate || '');
        this.metamorphosisData = data;
        this.saveMetamorphosisData();
    }

    updateMetamorphosisModuleStats() {
        if (!this.metamorphosisData) this.metamorphosisData = this.getDefaultMetamorphosisData();
        this.recomputeMetamorphosisAggregates();

        const targetEl = document.getElementById('metamorphosisTargetDays');
        if (targetEl) targetEl.textContent = String(this.metamorphosisData.targetDays || 7);
        const streakEl = document.getElementById('metamorphosisCurrentStreak');
        if (streakEl) streakEl.textContent = String(this.metamorphosisData.currentStreak || 0);
    }

    openMetamorphosisModule() {
        if (!this.metamorphosisData) this.metamorphosisData = this.getDefaultMetamorphosisData();
        this.recomputeMetamorphosisAggregates();

        this.metamorphosisViewMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);

        const root = document.getElementById('metamorphosisRoot');
        if (root) root.dataset.theme = this.metamorphosisData.theme || 'mountain';

        const targetSelect = document.getElementById('metamorphosisTargetSelect');
        const customGroup = document.getElementById('metamorphosisCustomTargetGroup');
        const customInput = document.getElementById('metamorphosisCustomTargetDays');
        const targetDays = Number(this.metamorphosisData.targetDays || 7) || 7;
        if (targetSelect) {
            const preset = ['5', '7', '12', '15'];
            if (preset.includes(String(targetDays))) {
                targetSelect.value = String(targetDays);
                if (customGroup) customGroup.style.display = 'none';
            } else {
                targetSelect.value = 'custom';
                if (customGroup) customGroup.style.display = 'block';
                if (customInput) customInput.value = String(targetDays);
            }
        }

        const themeSelect = document.getElementById('metamorphosisThemeSelect');
        if (themeSelect) themeSelect.value = this.metamorphosisData.theme || 'mountain';

        const todayLabel = document.getElementById('metamorphosisTodayLabel');
        if (todayLabel) todayLabel.textContent = `今天：${this.formatMetamorphosisDateKey(new Date())}`;

        this.syncMetamorphosisSettingButtons();
        this.populateMetamorphosisTodayForm();
        this.syncMetamorphosisPornReasonVisibility();
        this.syncMetamorphosisMasturbationReasonVisibility();
        this.renderMetamorphosisCheckinButton();
        this.renderMetamorphosisVisual();
        this.renderMetamorphosisDashboard();
        this.renderMetamorphosisCalendar();
        this.renderMetamorphosisChart();
    }

    populateMetamorphosisTodayForm() {
        const todayKey = this.formatMetamorphosisDateKey(new Date());
        const entry = this.metamorphosisData?.checkins?.[todayKey];
        if (!entry) return;

        const porn = entry.porn === 'setback' ? 'setback' : 'success';
        const masturbation = entry.masturbation === 'setback' ? 'setback' : 'success';
        const pornRadio = document.querySelector(`input[name="metamorphosisPorn"][value="${porn}"]`);
        const masturbationRadio = document.querySelector(`input[name="metamorphosisMasturbation"][value="${masturbation}"]`);
        if (pornRadio) pornRadio.checked = true;
        if (masturbationRadio) masturbationRadio.checked = true;

        const reasonSelect = document.getElementById('metamorphosisPornReason');
        if (reasonSelect) reasonSelect.value = String(entry.pornReason || '');

        const masturbationReasonSelect = document.getElementById('metamorphosisMasturbationReason');
        if (masturbationReasonSelect) masturbationReasonSelect.value = String(entry.masturbationReason || '');
    }

    applyMetamorphosisPillActive(groupId, value) {
        const group = document.getElementById(groupId);
        if (!group) return;
        const v = String(value || '');
        group.querySelectorAll('button.metamorphosis-pill').forEach((btn) => {
            const isActive = String(btn.dataset.value || '') === v;
            btn.classList.toggle('is-active', isActive);
        });
    }

    syncMetamorphosisSettingButtons() {
        const targetValue = document.getElementById('metamorphosisTargetSelect')?.value || '';
        const themeValue = document.getElementById('metamorphosisThemeSelect')?.value || '';
        this.applyMetamorphosisPillActive('metamorphosisTargetButtons', targetValue);
        this.applyMetamorphosisPillActive('metamorphosisThemeButtons', themeValue);
    }

    renderMetamorphosisCheckinButton() {
        const titleEl = document.getElementById('metamorphosisCheckinBtnTitle');
        const subEl = document.getElementById('metamorphosisCheckinBtnSub');
        const metaEl = document.getElementById('metamorphosisCheckinBtnMeta');
        if (!titleEl || !subEl || !metaEl) return;

        const todayKey = this.formatMetamorphosisDateKey(new Date());
        const entry = this.metamorphosisData?.checkins?.[todayKey];
        if (!entry) {
            titleEl.textContent = '开始今日打卡';
            subEl.textContent = '两道问题 · 记录成功或面对挫折';
            metaEl.innerHTML = '';
            return;
        }

        const porn = entry.porn === 'setback' ? 'setback' : 'success';
        const masturbation = entry.masturbation === 'setback' ? 'setback' : 'success';
        const overall = entry.overall === 'setback' ? 'setback' : (porn === 'success' && masturbation === 'success' ? 'success' : 'setback');

        titleEl.textContent = '今日已打卡';
        subEl.textContent = overall === 'success' ? '两题均成功' : '存在面对挫折';

        const pornText = porn === 'success' ? '色情内容：成功' : `色情内容：挫折${entry.pornReason ? `（${entry.pornReason}）` : ''}`;
        const masturbationText = masturbation === 'success' ? '手淫：成功' : `手淫：挫折${entry.masturbationReason ? `（${entry.masturbationReason}）` : ''}`;

        metaEl.innerHTML = `
            <span class="metamorphosis-checkin-chip ${porn}"><i class="${porn === 'success' ? 'fas fa-check' : 'fas fa-flag'}"></i>${pornText}</span>
            <span class="metamorphosis-checkin-chip ${masturbation}"><i class="${masturbation === 'success' ? 'fas fa-check' : 'fas fa-flag'}"></i>${masturbationText}</span>
        `;
    }

    resetMetamorphosisCheckinForm() {
        document.getElementById('metamorphosisCheckinForm')?.reset();

        const pornReason = document.getElementById('metamorphosisPornReason');
        if (pornReason) pornReason.value = '';

        const masturbationReason = document.getElementById('metamorphosisMasturbationReason');
        if (masturbationReason) masturbationReason.value = '';

        this.syncMetamorphosisPornReasonVisibility();
        this.syncMetamorphosisMasturbationReasonVisibility();
    }

    openMetamorphosisCheckinModal() {
        const modal = document.getElementById('metamorphosisCheckinModal');
        if (!modal) return;
        const title = document.getElementById('metamorphosisCheckinModalTitle');
        const todayKey = this.formatMetamorphosisDateKey(new Date());
        if (title) title.textContent = `今日打卡 · ${todayKey}`;

        this.resetMetamorphosisCheckinForm();
        this.populateMetamorphosisTodayForm();
        this.syncMetamorphosisPornReasonVisibility();
        this.syncMetamorphosisMasturbationReasonVisibility();

        modal.classList.add('active');
        modal.querySelector('.modal-content')?.scrollTo?.({ top: 0 });
    }

    closeMetamorphosisCheckinModal() {
        document.getElementById('metamorphosisCheckinModal')?.classList.remove('active');
    }

    svgToDataUri(svg) {
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(svg || ''))}`;
    }

    getMountainStageIndex(progress) {
        const p = Math.min(1, Math.max(0, Number(progress || 0) || 0));
        const stages = 5;
        return Math.min(stages - 1, Math.floor(p * stages));
    }

    getMountainStageAsset(stageIndex) {
        const idx = Math.max(0, Math.min(4, Number(stageIndex || 0) || 0));
        const stages = [
            { name: '低山', heightLabel: '300m', peak: 0.50, snow: 0.10, skyA: '#fde68a', skyB: '#fda4af', glow: '#fb7185' },
            { name: '丘陵', heightLabel: '800m', peak: 0.58, snow: 0.12, skyA: '#fbcfe8', skyB: '#a5b4fc', glow: '#818cf8' },
            { name: '雪山', heightLabel: '2500m', peak: 0.70, snow: 0.18, skyA: '#bae6fd', skyB: '#60a5fa', glow: '#38bdf8' },
            { name: '高峰', heightLabel: '5600m', peak: 0.80, snow: 0.22, skyA: '#c7d2fe', skyB: '#38bdf8', glow: '#22c55e' },
            { name: '珠穆朗玛峰', heightLabel: '8848m', peak: 0.88, snow: 0.28, skyA: '#bfdbfe', skyB: '#0ea5e9', glow: '#f8fafc' }
        ];
        const s = stages[idx];
        const peakY = 106 - Math.round(s.peak * 84);
        const baseY = 440;
        const snowY = peakY + Math.round((baseY - peakY) * (s.snow || 0.2));
        const ridgeA = peakY + Math.round((baseY - peakY) * 0.38);
        const ridgeB = peakY + Math.round((baseY - peakY) * 0.60);
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520" width="1200" height="520">
              <defs>
                <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="${s.skyA}"/>
                  <stop offset="1" stop-color="${s.skyB}"/>
                </linearGradient>
                <radialGradient id="sunGlow" cx="20%" cy="18%" r="60%">
                  <stop offset="0" stop-color="${s.glow}" stop-opacity="0.42"/>
                  <stop offset="1" stop-color="${s.glow}" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="rgba(255,255,255,0.70)"/>
                  <stop offset="1" stop-color="rgba(255,255,255,0)"/>
                </linearGradient>
                <linearGradient id="mountFaceA" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#f8fafc" stop-opacity="0.10"/>
                  <stop offset="0.45" stop-color="#0f172a" stop-opacity="0.92"/>
                  <stop offset="1" stop-color="#020617" stop-opacity="0.98"/>
                </linearGradient>
                <linearGradient id="mountFaceB" x1="1" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#e2e8f0" stop-opacity="0.16"/>
                  <stop offset="0.52" stop-color="#111827" stop-opacity="0.90"/>
                  <stop offset="1" stop-color="#020617" stop-opacity="0.98"/>
                </linearGradient>
                <linearGradient id="snow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#ffffff"/>
                  <stop offset="1" stop-color="#e2e8f0"/>
                </linearGradient>
                <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="b"/>
                  <feMerge>
                    <feMergeNode in="b"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="10" result="blur"/>
                  <feOffset dx="0" dy="14" result="off"/>
                  <feColorMatrix in="off" type="matrix"
                    values="0 0 0 0 0
                            0 0 0 0 0
                            0 0 0 0 0
                            0 0 0 0.24 0" result="shadow"/>
                  <feMerge>
                    <feMergeNode in="shadow"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                <filter id="grain" x="-10%" y="-10%" width="120%" height="120%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${idx + 3}" result="n"/>
                  <feColorMatrix type="saturate" values="0" in="n" result="g"/>
                  <feComponentTransfer in="g" result="gt">
                    <feFuncA type="table" tableValues="0 0.08"/>
                  </feComponentTransfer>
                  <feBlend in="SourceGraphic" in2="gt" mode="overlay"/>
                </filter>
              </defs>
              <rect width="1200" height="520" rx="34" fill="url(#sky)"/>
              <rect width="1200" height="520" rx="34" fill="url(#sunGlow)"/>
              <path d="M0 320 C 190 270, 420 360, 640 315 C 820 278, 980 340, 1200 292 L1200 520 L0 520 Z" fill="rgba(2,6,23,0.08)"/>

              <g filter="url(#shadow)">
                <path d="M90 ${baseY} L410 ${ridgeB} L640 ${ridgeA} L820 ${ridgeB} L1110 ${baseY} L1110 520 L90 520 Z" fill="rgba(2,6,23,0.26)"/>
                <path d="M140 ${baseY} L600 ${peakY} L1080 ${baseY} L1080 520 L140 520 Z" fill="url(#mountFaceA)"/>
                <path d="M600 ${peakY} L835 ${baseY} L540 ${baseY} Z" fill="url(#mountFaceB)"/>
                <path d="M600 ${peakY} L684 ${snowY} L600 ${snowY - 34} L520 ${snowY} Z" fill="url(#snow)"/>
                <path d="M600 ${snowY - 10} L740 ${baseY} L505 ${baseY} Z" fill="rgba(255,255,255,0.22)"/>
                <path d="M600 ${peakY} L720 ${ridgeA} L600 ${ridgeA - 34} L490 ${ridgeA} Z" fill="rgba(255,255,255,0.06)"/>
              </g>

              <path d="M0 388 C 210 360, 420 420, 630 392 C 830 366, 1000 420, 1200 392 L1200 520 L0 520 Z" fill="rgba(2,6,23,0.10)"/>
              <rect x="0" y="0" width="1200" height="520" rx="34" fill="url(#haze)" opacity="0.30"/>

              <g font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-weight="800" fill="rgba(15,23,42,0.88)">
                <text x="54" y="96" font-size="34">${s.name}</text>
                <text x="54" y="140" font-size="22" fill="rgba(15,23,42,0.70)">${s.heightLabel}</text>
              </g>
            </svg>
        `;
        return {
            name: s.name,
            heightLabel: s.heightLabel,
            src: this.svgToDataUri(svg)
        };
    }

    renderMetamorphosisVisual() {
        const visualEl = document.getElementById('metamorphosisVisual');
        if (!visualEl) return;

        const targetDays = Number(this.metamorphosisData?.targetDays || 7) || 7;
        const currentStreak = Number(this.metamorphosisData?.currentStreak || 0) || 0;
        const theme = this.metamorphosisData?.theme === 'tree' ? 'tree' : 'mountain';
        const progress = Math.min(1, targetDays > 0 ? currentStreak / targetDays : 0);
        const percent = Math.round(progress * 100);

        const titleIcon = theme === 'tree' ? 'fas fa-seedling' : 'fas fa-mountain';
        const titleText = theme === 'tree' ? '树木成长' : '山峰攀登';
        const metaText = `${currentStreak} / ${targetDays}（${percent}%）`;

        const mountainGoal = targetDays * 100;
        const mountainNow = Math.min(mountainGoal, currentStreak * 100);
        const treeStages = [
            { p: 0.0, label: '树苗' },
            { p: 0.25, label: '小树' },
            { p: 0.5, label: '成长' },
            { p: 0.75, label: '繁茂' },
            { p: 1.0, label: '参天' }
        ];
        const treeStage = treeStages.slice().reverse().find(s => progress >= s.p)?.label || '树苗';

        const leftLabel = theme === 'tree' ? '从树苗开始' : '起点';
        const rightLabel = theme === 'tree' ? `目标：${treeStage}` : `目标：${mountainGoal}m`;
        const midLabel = theme === 'tree' ? `阶段：${treeStage}` : `已攀登：${mountainNow}m`;

        const mountainStageIndex = this.getMountainStageIndex(progress);
        const mountainAsset = theme === 'mountain' ? this.getMountainStageAsset(mountainStageIndex) : null;
        const scene = theme === 'mountain'
            ? `<img class="metamorphosis-scene-image" src="${mountainAsset.src}" alt="${mountainAsset.name}">`
            : '';

        visualEl.innerHTML = `
            <div class="metamorphosis-visual-header">
                <div class="metamorphosis-visual-title">
                    <i class="${titleIcon}"></i>
                    <span>${titleText}</span>
                </div>
                <div class="metamorphosis-visual-meta">${metaText}</div>
            </div>
            ${scene}
            <div class="metamorphosis-progress-track">
                <div class="metamorphosis-progress-fill" style="width: ${percent}%;"></div>
            </div>
            <div class="metamorphosis-stage-row">
                <span>${leftLabel}</span>
                <span>${midLabel}</span>
                <span>${rightLabel}</span>
            </div>
        `;

        const badge = document.getElementById('metamorphosisProgressBadge');
        if (badge) badge.textContent = `${currentStreak} / ${targetDays}`;
    }

    renderMetamorphosisDashboard() {
        const streakEl = document.getElementById('metamorphosisDashboardCurrentStreak');
        if (streakEl) streakEl.textContent = String(this.metamorphosisData?.currentStreak || 0);

        const bestEl = document.getElementById('metamorphosisDashboardBestStreak');
        if (bestEl) bestEl.textContent = String(this.metamorphosisData?.stats?.bestStreak || 0);

        const successEl = document.getElementById('metamorphosisSuccessCount');
        if (successEl) successEl.textContent = String(this.metamorphosisData?.stats?.successCount || 0);

        const setbackEl = document.getElementById('metamorphosisSetbackCount');
        if (setbackEl) setbackEl.textContent = String(this.metamorphosisData?.stats?.setbackCount || 0);

        const checkins = this.metamorphosisData?.checkins || {};
        const pornReasonCounts = {};
        const masturbationReasonCounts = {};
        const combinedCounts = {};

        Object.values(checkins).forEach((entry) => {
            if (!entry || typeof entry !== 'object') return;
            const porn = entry.porn === 'setback' ? 'setback' : 'success';
            const masturbation = entry.masturbation === 'setback' ? 'setback' : 'success';

            if (porn === 'setback') {
                const reason = String(entry.pornReason || '').trim();
                if (reason) {
                    pornReasonCounts[reason] = (pornReasonCounts[reason] || 0) + 1;
                    combinedCounts[reason] = (combinedCounts[reason] || 0) + 1;
                }
            }

            if (masturbation === 'setback') {
                const reason = String(entry.masturbationReason || '').trim();
                if (reason) {
                    masturbationReasonCounts[reason] = (masturbationReasonCounts[reason] || 0) + 1;
                    combinedCounts[reason] = (combinedCounts[reason] || 0) + 1;
                }
            }
        });

        const topReasonEl = document.getElementById('metamorphosisTopReason');
        if (topReasonEl) {
            const top = Object.entries(combinedCounts).sort((a, b) => b[1] - a[1])[0];
            topReasonEl.textContent = top ? `${top[0]}×${top[1]}` : '-';
        }

        const renderReasonList = (containerId, counts) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
            if (!entries.length) {
                container.innerHTML = `<div class="metamorphosis-reason-item"><span>暂无数据</span><span class="count">0</span></div>`;
                return;
            }
            container.innerHTML = entries
                .map(([name, count]) => `<div class="metamorphosis-reason-item"><span>${name}</span><span class="count">${count}</span></div>`)
                .join('');
        };

        renderReasonList('metamorphosisPornReasonStats', pornReasonCounts);
        renderReasonList('metamorphosisMasturbationReasonStats', masturbationReasonCounts);
    }

    syncMetamorphosisPornReasonVisibility() {
        const group = document.getElementById('metamorphosisPornReasonGroup');
        const reasonSelect = document.getElementById('metamorphosisPornReason');
        const selected = document.querySelector('input[name="metamorphosisPorn"]:checked')?.value;
        const show = selected === 'setback';
        if (group) group.style.display = show ? 'block' : 'none';
        if (reasonSelect) {
            reasonSelect.required = show;
            if (!show) reasonSelect.value = '';
        }
    }

    syncMetamorphosisMasturbationReasonVisibility() {
        const group = document.getElementById('metamorphosisMasturbationReasonGroup');
        const reasonSelect = document.getElementById('metamorphosisMasturbationReason');
        const selected = document.querySelector('input[name="metamorphosisMasturbation"]:checked')?.value;
        const show = selected === 'setback';
        if (group) group.style.display = show ? 'block' : 'none';
        if (reasonSelect) {
            reasonSelect.required = show;
            if (!show) reasonSelect.value = '';
        }
    }

    handleMetamorphosisTargetChange(value) {
        if (!this.metamorphosisData) this.metamorphosisData = this.getDefaultMetamorphosisData();
        const select = document.getElementById('metamorphosisTargetSelect');
        const customGroup = document.getElementById('metamorphosisCustomTargetGroup');
        const customInput = document.getElementById('metamorphosisCustomTargetDays');
        const v = String(value || (select?.value || '7'));

        if (v === 'custom') {
            if (customGroup) customGroup.style.display = 'block';
            const days = Math.max(1, Number(customInput?.value || this.metamorphosisData?.targetDays || 7) || 7);
            this.metamorphosisData.targetDays = days;
        } else {
            if (customGroup) customGroup.style.display = 'none';
            this.metamorphosisData.targetDays = Math.max(1, Number(v) || 7);
        }

        this.saveMetamorphosisData();
        this.syncMetamorphosisSettingButtons();
        this.renderMetamorphosisVisual();
        this.updateMetamorphosisModuleStats();
    }

    handleMetamorphosisCustomTargetInput(value) {
        const selectValue = document.getElementById('metamorphosisTargetSelect')?.value;
        if (selectValue !== 'custom') return;
        const days = Math.max(1, Number(value || 0) || 0);
        if (!days) return;
        this.metamorphosisData.targetDays = days;
        this.saveMetamorphosisData();
        this.syncMetamorphosisSettingButtons();
        this.renderMetamorphosisVisual();
        this.updateMetamorphosisModuleStats();
    }

    handleMetamorphosisThemeChange(value) {
        const theme = String(value) === 'tree' ? 'tree' : 'mountain';
        if (!this.metamorphosisData) this.metamorphosisData = this.getDefaultMetamorphosisData();
        this.metamorphosisData.theme = theme;
        this.saveMetamorphosisData();
        const root = document.getElementById('metamorphosisRoot');
        if (root) root.dataset.theme = theme;
        this.syncMetamorphosisSettingButtons();
        this.renderMetamorphosisVisual();
        this.renderMetamorphosisCalendar();
        this.renderMetamorphosisChart();
    }

    handleMetamorphosisCheckin() {
        const pornValue = document.querySelector('input[name="metamorphosisPorn"]:checked')?.value;
        const masturbationValue = document.querySelector('input[name="metamorphosisMasturbation"]:checked')?.value;
        if (!pornValue || !masturbationValue) {
            this.showAppStatus('请完成两道打卡问题', 'warning');
            return;
        }

        const porn = pornValue === 'setback' ? 'setback' : 'success';
        const masturbation = masturbationValue === 'setback' ? 'setback' : 'success';
        const overall = (porn === 'success' && masturbation === 'success') ? 'success' : 'setback';
        const pornReason = porn === 'setback' ? String(document.getElementById('metamorphosisPornReason')?.value || '') : '';
        const masturbationReason = masturbation === 'setback' ? String(document.getElementById('metamorphosisMasturbationReason')?.value || '') : '';

        if (porn === 'setback' && !pornReason) {
            this.showAppStatus('请选择第 1 题的面对挫折原因', 'warning');
            return;
        }

        if (masturbation === 'setback' && !masturbationReason) {
            this.showAppStatus('请选择第 2 题的面对挫折原因', 'warning');
            return;
        }

        const dateKey = this.formatMetamorphosisDateKey(new Date());
        if (!this.metamorphosisData) this.metamorphosisData = this.getDefaultMetamorphosisData();
        if (!this.metamorphosisData.checkins || typeof this.metamorphosisData.checkins !== 'object') this.metamorphosisData.checkins = {};

        this.metamorphosisData.checkins[dateKey] = {
            porn,
            pornReason,
            masturbation,
            masturbationReason,
            overall,
            createdAt: new Date().toISOString()
        };

        this.recomputeMetamorphosisAggregates();
        this.updateMetamorphosisModuleStats();
        this.renderMetamorphosisVisual();
        this.renderMetamorphosisDashboard();
        this.renderMetamorphosisCalendar();
        this.renderMetamorphosisChart();
        this.renderMetamorphosisCheckinButton();
        this.updateOverviewStats();

        if (overall === 'success') {
            const currentStreak = Number(this.metamorphosisData.currentStreak || 0) || 0;
            const targetDays = Number(this.metamorphosisData.targetDays || 7) || 7;
            if (currentStreak >= targetDays) {
                this.showAppStatus(`达成目标：连续 ${targetDays} 天`, 'success', { sticky: true });
            } else {
                this.showAppStatus('今日打卡已保存', 'success');
            }
        } else {
            this.showAppStatus('今日已记录为面对挫折，连胜已重启', 'warning', { sticky: true });
        }

        this.closeMetamorphosisCheckinModal();
    }

    shiftMetamorphosisMonth(delta) {
        const d = this.metamorphosisViewMonth instanceof Date ? this.metamorphosisViewMonth : new Date();
        const next = new Date(d.getFullYear(), d.getMonth() + Number(delta || 0), 1);
        this.metamorphosisViewMonth = next;
        this.renderMetamorphosisCalendar();
    }

    renderMetamorphosisCalendar() {
        const grid = document.getElementById('metamorphosisCalendarGrid');
        if (!grid) return;

        const view = this.metamorphosisViewMonth instanceof Date ? this.metamorphosisViewMonth : new Date();
        const year = view.getFullYear();
        const month = view.getMonth();
        const first = new Date(year, month, 1);
        const last = new Date(year, month + 1, 0);

        const labelEl = document.getElementById('metamorphosisCalendarMonthLabel');
        if (labelEl) labelEl.textContent = `${year}年${month + 1}月`;

        const todayKey = this.formatMetamorphosisDateKey(new Date());
        const checkins = this.metamorphosisData?.checkins || {};
        const theme = this.metamorphosisData?.theme === 'tree' ? 'tree' : 'mountain';
        const successIcon = theme === 'tree' ? 'fas fa-seedling' : 'fas fa-mountain';
        const setbackIcon = 'fas fa-flag';

        const offset = first.getDay();
        const totalDays = last.getDate();

        const cells = [];
        for (let i = 0; i < offset; i += 1) {
            cells.push(`<div class="calendar-day is-empty" aria-hidden="true"></div>`);
        }

        for (let day = 1; day <= totalDays; day += 1) {
            const cellDate = new Date(year, month, day);
            const dateKey = this.formatMetamorphosisDateKey(cellDate);
            const entry = checkins?.[dateKey];
            const overall = entry?.overall === 'setback' ? 'setback' : (entry ? 'success' : '');
            const badge = overall
                ? `<span class="metamorphosis-badge ${overall}"><i class="${overall === 'success' ? successIcon : setbackIcon}"></i></span>`
                : '';
            const isToday = dateKey === todayKey;

            cells.push(`
                <div class="calendar-day${isToday ? ' today' : ''}" data-date="${dateKey}">
                    <span class="metamorphosis-day-number">${day}</span>
                    ${badge}
                </div>
            `);
        }

        while (cells.length % 7 !== 0) {
            cells.push(`<div class="calendar-day is-empty" aria-hidden="true"></div>`);
        }

        while (cells.length < 42) {
            cells.push(`<div class="calendar-day is-empty" aria-hidden="true"></div>`);
        }

        grid.innerHTML = cells.join('');
    }

    renderMetamorphosisChart() {
        const canvas = document.getElementById('metamorphosisChart');
        if (!canvas) return;

        const checkins = this.metamorphosisData?.checkins || {};
        const labels = [];
        const successData = [];
        const setbackData = [];

        const days = 14;
        for (let i = days - 1; i >= 0; i -= 1) {
            const date = this.addDays(new Date(), -i);
            const key = this.formatMetamorphosisDateKey(date);
            const entry = checkins[key];
            const overall = entry?.overall === 'setback' ? 'setback' : (entry ? 'success' : '');
            labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
            successData.push(overall === 'success' ? 1 : 0);
            setbackData.push(overall === 'setback' ? 1 : 0);
        }

        if (this.metamorphosisChartInstance) {
            try {
                this.metamorphosisChartInstance.destroy();
            } catch {
            }
            this.metamorphosisChartInstance = null;
        }

        if (typeof Chart === 'undefined') return;

        this.metamorphosisChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: '成功',
                        data: successData,
                        backgroundColor: 'rgba(16, 185, 129, 0.75)',
                        borderRadius: 8
                    },
                    {
                        label: '面对挫折',
                        data: setbackData,
                        backgroundColor: 'rgba(245, 158, 11, 0.75)',
                        borderRadius: 8
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        suggestedMax: 1,
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    title: {
                        display: false
                    }
                }
            }
        });
    }

    exportMetamorphosisData() {
        if (!this.metamorphosisData) {
            this.showAppStatus('没有可导出的数据', 'warning');
            return;
        }

        const payload = {
            exportedAt: new Date().toISOString(),
            metamorphosisData: this.metamorphosisData
        };
        const dataStr = JSON.stringify(payload, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = `metamorphosis_data_${this.formatMetamorphosisDateKey(new Date())}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        document.body.appendChild(linkElement);
        linkElement.click();
        document.body.removeChild(linkElement);
    }

    importMetamorphosisData(event) {
        const file = event?.target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                const inner = parsed?.metamorphosisData ? parsed.metamorphosisData : parsed;
                const normalized = this.normalizeMetamorphosisData(inner);
                this.metamorphosisData = normalized;
                this.saveMetamorphosisData();
                this.recomputeMetamorphosisAggregates();
                this.updateMetamorphosisModuleStats();
                this.openMetamorphosisModule();
                this.showAppStatus('蜕变数据导入成功', 'success', { sticky: true });
            } catch (error) {
                console.error('导入蜕变数据失败:', error);
                this.showAppStatus('导入失败：数据格式不正确', 'error', { sticky: true });
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    // 显示学习模块
    showLearningModule(module) {
        console.log('显示学习模块:', module);

        if (module !== 'todoCalendar' && this.currentSystem !== 'learning') {
            this.showSystem('learning');
            window.requestAnimationFrame(() => this.showLearningModule(module));
            return;
        }
        
        // 隐藏学习主页
        const learningHome = document.getElementById('learningHome');
        if (learningHome) {
            learningHome.style.display = 'none';
            learningHome.classList.remove('show-module');
        }
        
        // 隐藏所有学习模块页面
        document.querySelectorAll('.learning-module-page').forEach(page => {
            page.style.display = 'none';
            page.classList.remove('show-module');
        });
        
        if (module === 'todoCalendar') {
            this.showSystem('todo-calendar');
            return;
        } else if (module === 'learningPlan') {
            const moduleElement = document.getElementById('learningPlanModule');
            console.log('显示学习计划模块:', moduleElement);
            if (moduleElement) {
                // 使用CSS类来控制显示，避免与!important冲突
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
                this.renderLearningPlans();
                this.updatePlanStats();
            } else {
                console.error('找不到学习计划模块元素');
            }
        } else if (module === 'english') {
            const moduleElement = document.getElementById('englishModule');
            if (moduleElement) {
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
            }
        } else if (module === 'newConcept') {
            this.showEnglishSubmodule('newConcept');
        } else if (module === 'reading') {
            const moduleElement = document.getElementById('readingModule');
            if (moduleElement) {
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
                this.resetReadingForm({ keepDates: true });
                this.initializeReadingFormDefaults();
                this.renderReadingPlans();
            }
        } else if (module === 'timetable') {
            const moduleElement = document.getElementById('timetableModule');
            if (moduleElement) {
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
                this.initTimetableIfNeeded();
                this.renderTimetableAll();
            }
        } else if (module === 'generalKnowledge') {
            const moduleElement = document.getElementById('generalKnowledgeModule');
            if (moduleElement) {
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
                this.showGeneralKnowledgeHome();
                this.updateGkStats();
            }
        }
    }

    showEnglishSubmodule(submodule) {
        const target = String(submodule || '');
        if (!target) return;

        this.showLearningModule('english');

        const englishModule = document.getElementById('englishModule');
        if (englishModule) {
            englishModule.style.display = 'none';
            englishModule.classList.remove('show-module');
        }

        if (target === 'newConcept') {
            const moduleElement = document.getElementById('newConceptModule');
            if (!moduleElement) return;
            moduleElement.style.display = 'block';
            moduleElement.classList.add('show-module');
            const titleEl = moduleElement.querySelector('.pwa-header-title h1');
            const subtitleEl = moduleElement.querySelector('.pwa-header-title .pwa-subtitle');
            if (titleEl) titleEl.innerHTML = `<i class="fas fa-book-open"></i> 英语 / 新概念`;
            if (subtitleEl) subtitleEl.textContent = '外部内容入口（极速英语）';
            this.renderNewConceptLists();
            return;
        }

        if (target === 'materials') {
            const moduleElement = document.getElementById('englishMaterialsModule');
            if (!moduleElement) return;
            moduleElement.style.display = 'block';
            moduleElement.classList.add('show-module');
        }
    }

    getNewConceptBaseUrl() {
        return 'https://www.runtoenglish.com';
    }

    loadNewConceptState() {
        const safeParseArray = (key) => {
            try {
                const raw = localStorage.getItem(key);
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        };

        return {
            recent: safeParseArray('newConceptRecent'),
            favorites: safeParseArray('newConceptFavorites')
        };
    }

    saveNewConceptState(state) {
        const safeStringify = (value) => {
            try {
                return JSON.stringify(value);
            } catch {
                return '[]';
            }
        };
        localStorage.setItem('newConceptRecent', safeStringify(state.recent || []));
        localStorage.setItem('newConceptFavorites', safeStringify(state.favorites || []));
    }

    normalizeNewConceptUrl(input) {
        const raw = String(input || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith('/')) return `${this.getNewConceptBaseUrl()}${raw}`;
        return `${this.getNewConceptBaseUrl()}/${raw.replace(/^\/+/, '')}`;
    }

    getNewConceptTitleForUrl(url) {
        try {
            const u = new URL(url);
            const path = u.pathname || '';
            const q = u.searchParams.get('q') || '';

            const bookMatch = path.match(/^\/books\/nce(\d+)/i);
            if (bookMatch) return `新概念英语第${bookMatch[1]}册（目录）`;

            const wordsMatch = path.match(/^\/books\/words\/(\d+)/i);
            if (wordsMatch) return `第${wordsMatch[1]}册单词`;

            const lessonMatch = path.match(/^\/lessons\/(\d+)/i);
            if (lessonMatch) return `课文 ${lessonMatch[1]}`;

            if (path.startsWith('/search') && q) return `搜索：${q}`;
        } catch {
            return url;
        }
        return url;
    }

    openNewConceptUrl(url, options = {}) {
        const { title = '', track = true } = options || {};
        const normalizedUrl = this.normalizeNewConceptUrl(url);
        if (!normalizedUrl) return;

        if (track) {
            const state = this.loadNewConceptState();
            const resolvedTitle = title || this.getNewConceptTitleForUrl(normalizedUrl);
            const entry = { url: normalizedUrl, title: resolvedTitle, ts: Date.now() };

            state.recent = [entry, ...state.recent.filter(item => item?.url !== normalizedUrl)].slice(0, 12);
            this.saveNewConceptState(state);
            this.renderNewConceptLists();
        }

        window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
    }

    toggleNewConceptFavorite(url, title = '') {
        const normalizedUrl = this.normalizeNewConceptUrl(url);
        if (!normalizedUrl) return;
        const state = this.loadNewConceptState();
        const exists = state.favorites.some(item => item?.url === normalizedUrl);
        if (exists) {
            state.favorites = state.favorites.filter(item => item?.url !== normalizedUrl);
        } else {
            const resolvedTitle = title || this.getNewConceptTitleForUrl(normalizedUrl);
            state.favorites = [{ url: normalizedUrl, title: resolvedTitle, ts: Date.now() }, ...state.favorites].slice(0, 30);
        }
        this.saveNewConceptState(state);
        this.renderNewConceptLists();
    }

    clearNewConceptRecent() {
        const state = this.loadNewConceptState();
        state.recent = [];
        this.saveNewConceptState(state);
        this.renderNewConceptLists();
    }

    clearNewConceptFavorites() {
        const state = this.loadNewConceptState();
        state.favorites = [];
        this.saveNewConceptState(state);
        this.renderNewConceptLists();
    }

    renderNewConceptLists() {
        const recentEl = document.getElementById('newConceptRecentList');
        const favEl = document.getElementById('newConceptFavoritesList');
        if (!recentEl || !favEl) return;

        const state = this.loadNewConceptState();
        const favoritesSet = new Set((state.favorites || []).map(item => item?.url).filter(Boolean));

        const renderItems = (items, target) => {
            const list = Array.isArray(items) ? items.filter(i => i && i.url).slice(0, 10) : [];
            if (list.length === 0) {
                target.innerHTML = `<div class="pwa-empty-state"><i class="fas fa-link"></i><h3>暂无内容</h3><p>打开一次后会自动出现在这里</p></div>`;
                return;
            }
            target.innerHTML = list.map(item => {
                const safeTitle = String(item.title || item.url);
                const isFav = favoritesSet.has(item.url);
                const starIcon = isFav ? 'fas fa-star' : 'far fa-star';
                return `
                    <div class="new-concept-link-item">
                        <button type="button" class="btn btn-outline new-concept-link-btn" data-new-concept-open="${item.url}">
                            <span class="new-concept-link-title">${safeTitle}</span>
                            <span class="new-concept-link-url">${item.url}</span>
                        </button>
                        <button type="button" class="btn btn-outline new-concept-link-fav" data-new-concept-fav="${item.url}" aria-label="收藏">
                            <i class="${starIcon}"></i>
                        </button>
                    </div>
                `;
            }).join('');
        };

        renderItems(state.recent, recentEl);
        renderItems(state.favorites, favEl);
    }

    loadReadingPlans() {
        try {
            const saved = localStorage.getItem('selfSystemReadingPlans');
            const parsed = saved ? JSON.parse(saved) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error('加载读书计划失败:', error);
            return [];
        }
    }

    saveReadingPlans() {
        try {
            localStorage.setItem('selfSystemReadingPlans', JSON.stringify(this.readingPlans || []));
        } catch (error) {
            console.error('保存读书计划失败:', error);
        }
    }

    isHostedEnvironment() {
        const hostname = String(window.location.hostname || '').toLowerCase();
        return !(hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '');
    }

    loadAssetOverrides() {
        try {
            const raw = localStorage.getItem('selfSystemAssetOverrides');
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    saveAssetOverrides(next) {
        try {
            localStorage.setItem('selfSystemAssetOverrides', JSON.stringify(next && typeof next === 'object' ? next : {}));
        } catch {
        }
    }

    async verifyUrlAvailable(url) {
        const raw = String(url || '').trim();
        if (!raw) return false;
        const noHash = raw.split('#')[0];
        try {
            const res = await fetch(noHash, {
                method: 'GET',
                cache: 'no-store',
                headers: { Range: 'bytes=0-0' }
            });
            try {
                res.body?.cancel?.();
            } catch {
            }
            return res.status === 200 || res.status === 206;
        } catch {
            try {
                const res = await fetch(noHash, { method: 'HEAD', cache: 'no-store' });
                return !!res.ok;
            } catch {
                return false;
            }
        }
    }

    getDefaultPdfFileName() {
        return '中国古代名句辞典(修订本).1_副本.pdf';
    }

    getPdfBaseUrl() {
        if (this.pdfFileBaseUrl) return String(this.pdfFileBaseUrl);
        const overrides = this.loadAssetOverrides();
        const override = typeof overrides.pdfUrl === 'string' ? overrides.pdfUrl.trim() : '';
        if (override) return override;
        return encodeURIComponent(this.getDefaultPdfFileName());
    }

    syncPdfAssetLinks() {
        const base = this.getPdfBaseUrl();
        const openBtn = document.getElementById('pdfOpenRawBtn');
        const dl = document.getElementById('pdfFallbackDownload');
        const unsupported = document.getElementById('pdfUnsupportedLink');
        const importOpen = document.querySelector('#gkImportModal a[href*="打开当前PDF"]');
        const href = base || '#';
        if (openBtn) openBtn.setAttribute('href', href);
        if (dl) dl.setAttribute('href', href);
        if (unsupported) unsupported.setAttribute('href', href);
        if (importOpen) importOpen.setAttribute('href', href);
    }

    async ensurePdfAvailable() {
        if (this.pdfFileBaseUrl) return true;
        if (this.pdfAvailabilityChecked) return !!this.pdfAvailabilityOk;
        this.pdfAvailabilityChecked = true;
        const base = this.getPdfBaseUrl();
        const ok = await this.verifyUrlAvailable(base);
        this.pdfAvailabilityOk = ok;
        if (!ok) {
            this.showAppStatus('PDF 原书未部署：文件未随站点发布（或链接不可用）。请点链条按钮设置直链，或选择本地 PDF', 'warning', { sticky: true });
        }
        return ok;
    }

    async promptSetPdfUrl() {
        const overrides = this.loadAssetOverrides();
        const current = typeof overrides.pdfUrl === 'string' ? overrides.pdfUrl : '';
        const next = window.prompt('请输入 PDF 直链（https://.../file.pdf），留空则清除：', current || '');
        if (next == null) return;
        const trimmed = String(next).trim();
        const updated = { ...overrides };
        if (!trimmed) delete updated.pdfUrl;
        else updated.pdfUrl = trimmed;
        this.saveAssetOverrides(updated);
        this.pdfAvailabilityChecked = false;
        this.pdfAvailabilityOk = false;
        this.pdfFileBaseUrl = '';
        this.syncPdfAssetLinks();
        this.goToPage(1);
    }

    getDefaultOxfordFileName() {
        return '牛津通识读本百本纪念套装（共100册）.epub';
    }

    getOxfordSourceUrl() {
        const overrides = this.loadAssetOverrides();
        const override = typeof overrides.oxfordEpubUrl === 'string' ? overrides.oxfordEpubUrl.trim() : '';
        if (override) return override;
        return encodeURIComponent(this.oxfordState?.file || this.getDefaultOxfordFileName());
    }

    syncOxfordAssetLinks() {
        const src = this.getOxfordSourceUrl();
        const downloadBtn = document.getElementById('oxfordDownloadBtn');
        const openRawBtn = document.getElementById('oxfordOpenRawBtn');
        const href = src || '#';
        if (downloadBtn) downloadBtn.setAttribute('href', href);
        if (openRawBtn) openRawBtn.setAttribute('href', href);
    }

    async promptSetOxfordUrl() {
        const overrides = this.loadAssetOverrides();
        const current = typeof overrides.oxfordEpubUrl === 'string' ? overrides.oxfordEpubUrl : '';
        const next = window.prompt('请输入 EPUB 直链（https://.../file.epub），留空则清除：', current || '');
        if (next == null) return;
        const trimmed = String(next).trim();
        const updated = { ...overrides };
        if (!trimmed) delete updated.oxfordEpubUrl;
        else updated.oxfordEpubUrl = trimmed;
        this.saveAssetOverrides(updated);
        this.syncOxfordAssetLinks();
        this.openOxfordDefaultEpub();
    }

    async loadReadingPlansFromApi() {
        const hostname = String(window.location.hostname || '').toLowerCase();
        const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
        if (!isLocalHost) {
            this.hideAppStatus();
            return;
        }

        this.showAppStatus('正在加载读书计划…', 'info');
        try {
            const res = await fetch('/api/reading/plans', { cache: 'no-store' });
            if (!res.ok) {
                if ((this.readingPlans || []).length) {
                    this.showAppStatus('读书计划已使用本地数据', 'warning');
                } else {
                    this.showAppStatus('读书计划加载失败：服务不可用', 'warning');
                }
                return;
            }
            const data = await res.json();
            const plans = Array.isArray(data?.plans) ? data.plans : [];
            if (plans.length === 0) {
                this.hideAppStatus();
                return;
            }
            this.readingPlans = plans;
            this.saveReadingPlans();
            this.resyncReadingPlansToTodoCalendar();
            this.renderReadingPlans();
            this.showAppStatus('读书计划已同步', 'success');
        } catch (e) {
            this.showAppStatus('读书计划加载失败：已使用本地数据', 'warning');
            console.error(e);
        }
    }

    async upsertReadingPlanToApi(plan) {
        try {
            const url = `/api/reading/plans/${encodeURIComponent(plan.id)}`;
            const method = 'PUT';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(plan)
            });
            if (res.ok) return true;
        } catch {
        }
        return false;
    }

    async createReadingPlanToApi(plan) {
        try {
            const res = await fetch('/api/reading/plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(plan)
            });
            if (res.ok) return true;
        } catch {
        }
        return false;
    }

    async deleteReadingPlanFromApi(id) {
        try {
            const res = await fetch(`/api/reading/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
            return res.ok;
        } catch {
            return false;
        }
    }

    initializeReadingFormDefaults() {
        const startDateEl = document.getElementById('readingStartDate');
        if (startDateEl && !startDateEl.value) {
            startDateEl.value = this.formatDate(this.currentDate);
        }
        this.toggleReadingRecurrenceType(this.getSelectedReadingRecurrenceType());
        this.clearReadingErrors();
        const list = document.getElementById('readingPlansList');
        if (list && !list.dataset.bound) {
            list.dataset.bound = '1';
            list.addEventListener('click', (e) => {
                const editBtn = e.target.closest?.('[data-reading-edit]');
                if (editBtn) {
                    const id = editBtn.getAttribute('data-reading-edit');
                    if (id) this.editReadingPlan(id);
                    return;
                }
                const deleteBtn = e.target.closest?.('[data-reading-delete]');
                if (deleteBtn) {
                    const id = deleteBtn.getAttribute('data-reading-delete');
                    if (id) this.deleteReadingPlan(id);
                }
            });
        }
    }

    resetReadingForm(options = {}) {
        const { keepDates = false } = options || {};
        const startDateEl = document.getElementById('readingStartDate');
        const endDateEl = document.getElementById('readingEndDate');
        const prevStartDate = String(startDateEl?.value || '');
        const prevEndDate = String(endDateEl?.value || '');
        const prevRecurrenceType = this.getSelectedReadingRecurrenceType();
        const prevWeekdays = Array.from(document.querySelectorAll('input[name="readingWeekdays"]:checked')).map(el =>
            Number(el.value)
        );
        const prevCustomCount = String(document.getElementById('readingCustomCount')?.value || '');
        const prevCustomInterval = String(document.getElementById('readingCustomInterval')?.value || '');
        const prevCustomUnit = String(document.getElementById('readingCustomUnit')?.value || '');
        const form = document.getElementById('readingForm');
        if (form) form.reset();
        const idEl = document.getElementById('readingPlanId');
        if (idEl) idEl.value = '';

        if (startDateEl) {
            startDateEl.value = keepDates && prevStartDate ? prevStartDate : this.formatDate(this.currentDate);
        }
        if (endDateEl) {
            endDateEl.value = keepDates ? prevEndDate : '';
        }

        const nextType = keepDates ? prevRecurrenceType : 'daily';
        const radio = document.querySelector(`input[name="readingRecurrenceType"][value="${nextType}"]`);
        if (radio) radio.checked = true;
        this.toggleReadingRecurrenceType(nextType);

        if (keepDates && nextType === 'weekly') {
            document.querySelectorAll('input[name="readingWeekdays"]').forEach(cb => {
                cb.checked = prevWeekdays.includes(Number(cb.value));
            });
        }
        if (keepDates && nextType === 'custom') {
            const countEl = document.getElementById('readingCustomCount');
            if (countEl) countEl.value = prevCustomCount || '1';
            const intervalEl = document.getElementById('readingCustomInterval');
            if (intervalEl) intervalEl.value = prevCustomInterval || '1';
            const unitEl = document.getElementById('readingCustomUnit');
            if (unitEl) unitEl.value = prevCustomUnit || 'day';
        }

        this.clearReadingErrors();
    }

    clearReadingErrors() {
        document.querySelectorAll('#readingModule .field-error').forEach(el => {
            el.textContent = '';
        });
        document.querySelectorAll('#readingModule .input-error').forEach(el => {
            el.classList.remove('input-error');
        });
    }

    setReadingFieldError(fieldId, message) {
        const input = document.getElementById(fieldId);
        if (input) input.classList.add('input-error');
        const errEl = document.getElementById(`${fieldId}Error`);
        if (errEl) errEl.textContent = message || '';
    }

    getSelectedReadingRecurrenceType() {
        const checked = document.querySelector('input[name="readingRecurrenceType"]:checked');
        return checked ? checked.value : 'daily';
    }

    toggleReadingRecurrenceType(type) {
        const weekly = document.getElementById('readingWeeklyOptions');
        const custom = document.getElementById('readingCustomOptions');
        if (weekly) weekly.style.display = type === 'weekly' ? 'block' : 'none';
        if (custom) custom.style.display = type === 'custom' ? 'block' : 'none';
    }

    applyQuickDate(targetId, action) {
        const input = document.getElementById(targetId);
        if (!input) return;
        const today = new Date(this.currentDate);
        const base = input.value ? new Date(`${input.value}T00:00:00`) : new Date(today);
        const d = new Date(base);

        let nextValue = null;

        if (action === 'clear') {
            nextValue = '';
        } else if (action === 'today') {
            nextValue = this.formatDate(today);
        } else if (action === 'yesterday') {
            d.setTime(today.getTime());
            d.setDate(d.getDate() - 1);
            nextValue = this.formatDate(d);
        } else if (action === 'plus_7') {
            d.setDate(d.getDate() + 7);
            nextValue = this.formatDate(d);
        } else if (action === 'plus_30') {
            d.setDate(d.getDate() + 30);
            nextValue = this.formatDate(d);
        } else if (action === 'this_monday') {
            const monday = new Date(today);
            const day = monday.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            monday.setDate(monday.getDate() + diff);
            nextValue = this.formatDate(monday);
        } else if (action === 'month_start') {
            const ms = new Date(today.getFullYear(), today.getMonth(), 1);
            nextValue = this.formatDate(ms);
        }

        if (nextValue === null) return;
        input.value = nextValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    getReadingRecurrenceRule(recurrenceType, startDateValue) {
        const startDateObj = new Date(`${startDateValue}T00:00:00`);
        const startWeekday = startDateObj.getDay();
        const startDayOfMonth = startDateObj.getDate();

        if (recurrenceType === 'daily') {
            return { type: 'daily', interval: 1 };
        }
        if (recurrenceType === 'weekly') {
            const days = Array.from(document.querySelectorAll('input[name="readingWeekdays"]:checked')).map(el => Number(el.value));
            return { type: 'weekly', interval: 1, days: days.length ? days : [startWeekday] };
        }
        if (recurrenceType === 'monthly') {
            return { type: 'monthly', interval: 1, dayOfMonth: startDayOfMonth };
        }

        const count = Number(document.getElementById('readingCustomCount')?.value || 0);
        const interval = Number(document.getElementById('readingCustomInterval')?.value || 0);
        const unit = String(document.getElementById('readingCustomUnit')?.value || 'day');
        return { type: 'custom', interval: interval || 1, unit: unit || 'day', count: count || 1 };
    }

    validateReadingForm() {
        this.clearReadingErrors();

        const titleEl = document.getElementById('readingBookTitle');
        const statusEl = document.getElementById('readingStatus');
        const startEl = document.getElementById('readingStartDate');
        const endEl = document.getElementById('readingEndDate');

        const title = String(titleEl?.value || '').trim();
        const status = String(statusEl?.value || '').trim();
        const startDate = String(startEl?.value || '').trim();
        const endDate = String(endEl?.value || '').trim();

        let ok = true;

        if (!title) {
            this.setReadingFieldError('readingBookTitle', '请输入书名');
            ok = false;
        } else if (title.length > 100) {
            this.setReadingFieldError('readingBookTitle', '书名不能超过100字符');
            ok = false;
        }

        if (!status) {
            this.setReadingFieldError('readingStatus', '请选择阅读状态');
            ok = false;
        }

        if (!startDate) {
            this.setReadingFieldError('readingStartDate', '请选择开始阅读时间');
            ok = false;
        }

        if (startDate && endDate && startDate > endDate) {
            this.setReadingFieldError('readingEndDate', '结束时间不得早于开始时间');
            ok = false;
        }

        const recurrenceType = this.getSelectedReadingRecurrenceType();

        if (recurrenceType === 'weekly') {
            const days = Array.from(document.querySelectorAll('input[name=\"readingWeekdays\"]:checked'));
            if (days.length === 0) {
                const err = document.getElementById('readingWeekdaysError');
                if (err) err.textContent = '每周重复至少选择一个星期几';
                ok = false;
            }
        }

        if (recurrenceType === 'custom') {
            const count = Number(document.getElementById('readingCustomCount')?.value || 0);
            const interval = Number(document.getElementById('readingCustomInterval')?.value || 0);
            if (!Number.isInteger(count) || count <= 0) {
                this.setReadingFieldError('readingCustomCount', '自定义重复次数必须为正整数');
                ok = false;
            }
            if (!Number.isInteger(interval) || interval <= 0) {
                const err = document.getElementById('readingCustomIntervalError');
                if (err) err.textContent = '间隔周期必须为正整数';
                const intervalEl = document.getElementById('readingCustomInterval');
                if (intervalEl) intervalEl.classList.add('input-error');
                ok = false;
            }
        }

        if (!ok) return null;

        const rule = this.getReadingRecurrenceRule(recurrenceType, startDate);

        return {
            title,
            status,
            startDate,
            endDate: endDate || null,
            recurrenceType,
            recurrenceRule: rule
        };
    }

    deriveReadingEndDate(startDateValue, recurrenceType) {
        const start = new Date(`${startDateValue}T00:00:00`);
        const end = new Date(start);
        if (recurrenceType === 'daily') end.setDate(end.getDate() + 30);
        else if (recurrenceType === 'weekly') end.setDate(end.getDate() + 60);
        else if (recurrenceType === 'monthly') end.setDate(end.getDate() + 180);
        else end.setDate(end.getDate() + 30);
        return this.formatDate(end);
    }

    generateCustomCountDates(startDateValue, count, interval, unit) {
        const out = [];
        const start = new Date(`${startDateValue}T00:00:00`);
        const step = Math.max(1, Number(interval) || 1);
        const total = Math.max(1, Number(count) || 1);
        let cursor = new Date(start);
        for (let i = 0; i < total; i += 1) {
            out.push(this.formatDate(cursor));
            if (unit === 'week') {
                cursor.setDate(cursor.getDate() + step * 7);
            } else if (unit === 'month') {
                const y = cursor.getFullYear();
                const m = cursor.getMonth() + step;
                const d = cursor.getDate();
                const lastDay = new Date(y, m + 1, 0).getDate();
                cursor = new Date(y, m, Math.min(d, lastDay));
            } else {
                cursor.setDate(cursor.getDate() + step);
            }
        }
        return out;
    }

    getReadingPlanDates(plan) {
        if (plan?.recurrenceRule?.type === 'custom' && Number.isInteger(plan?.recurrenceRule?.count) && !plan.endDate) {
            const rule = plan.recurrenceRule;
            return this.generateCustomCountDates(plan.startDate, rule.count, rule.interval, rule.unit);
        }
        const safeEnd = plan.endDate || this.deriveReadingEndDate(plan.startDate, plan.recurrenceType);
        return this.getPlanDates({ startDate: plan.startDate, endDate: safeEnd, recurrenceRule: plan.recurrenceRule });
    }

    syncReadingPlanToSchedules(plan) {
        const dates = this.getReadingPlanDates(plan);
        const todoSchedules = this.loadTodoCalendarSchedules();
        const priority = 'medium';

        dates.forEach(date => {
            const schedule = {
                id: `${plan.id}-${date}`,
                title: `读书：${plan.title}`,
                description: `[读书] ${plan.status}`,
                startTime: '',
                endTime: '',
                priority,
                date,
                planId: plan.id
            };

            const existingIndex = this.schedules.findIndex(s => s.id === schedule.id);
            if (existingIndex >= 0) {
                this.schedules[existingIndex] = schedule;
            } else {
                this.schedules.push(schedule);
            }

            const dateKey = new Date(`${date}T00:00:00`).toDateString();
            if (!Array.isArray(todoSchedules[dateKey])) todoSchedules[dateKey] = [];

            const todoItem = {
                id: schedule.id,
                time: '',
                content: `[读书] ${plan.title}（${plan.status}）`,
                priority,
                planId: plan.id
            };
            const todoExistingIndex = todoSchedules[dateKey].findIndex(s => s.id === todoItem.id);
            if (todoExistingIndex >= 0) {
                todoSchedules[dateKey][todoExistingIndex] = todoItem;
            } else {
                todoSchedules[dateKey].push(todoItem);
            }
        });

        this.saveSchedules();
        this.saveTodoCalendarSchedules(todoSchedules);
    }

    resyncReadingPlansToTodoCalendar() {
        if (!Array.isArray(this.readingPlans) || this.readingPlans.length === 0) return;
        this.readingPlans.forEach(plan => {
            if (!plan?.id) return;
            this.deletePlanSchedules(plan.id);
            this.syncReadingPlanToSchedules(plan);
        });
    }

    getReadingRecurrenceDisplay(plan) {
        const rule = plan?.recurrenceRule || { type: 'daily', interval: 1 };
        if (plan.recurrenceType === 'daily') return '每日';
        if (plan.recurrenceType === 'weekly') {
            const days = Array.isArray(rule.days) ? rule.days : [];
            return days.length ? `每周（${this.formatWeekdays(days)}）` : '每周';
        }
        if (plan.recurrenceType === 'monthly') {
            const dayOfMonth = Number(rule.dayOfMonth) || new Date(`${plan.startDate}T00:00:00`).getDate();
            return `每月${dayOfMonth}日`;
        }
        const interval = Number(rule.interval) || 1;
        const unit = rule.unit || 'day';
        const count = Number(rule.count) || 1;
        return `自定义：${count}次，每${interval}${this.getUnitText(unit)}`;
    }

    renderReadingPlans() {
        const container = document.getElementById('readingPlansList');
        if (!container) return;

        const plans = Array.isArray(this.readingPlans) ? [...this.readingPlans] : [];
        plans.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

        if (plans.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <p>还没有创建读书计划</p>
                    <p class="empty-hint">填写上方表单并保存即可生成</p>
                </div>
            `;
            return;
        }

        container.innerHTML = plans
            .map(plan => {
                const rangeText = plan.endDate ? `${plan.startDate} 至 ${plan.endDate}` : `${plan.startDate}`;
                const recurrenceText = this.getReadingRecurrenceDisplay(plan);
                return `
                    <div class="reading-plan-item" data-reading-id="${plan.id}">
                        <div class="reading-plan-header">
                            <div>
                                <h4 class="reading-plan-title">${plan.title}</h4>
                                <div class="reading-plan-meta">
                                    <span class="reading-plan-chip"><i class="fas fa-flag"></i>${plan.status}</span>
                                    <span class="reading-plan-chip"><i class="fas fa-calendar"></i>${rangeText}</span>
                                    <span class="reading-plan-chip"><i class="fas fa-repeat"></i>${recurrenceText}</span>
                                </div>
                            </div>
                            <div class="reading-plan-actions">
                                <button type="button" class="btn btn-outline btn-sm" data-reading-edit="${plan.id}"><i class="fas fa-edit"></i> 编辑</button>
                                <button type="button" class="btn btn-danger btn-sm" data-reading-delete="${plan.id}"><i class="fas fa-trash"></i> 删除</button>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join('');
    }

    editReadingPlan(id) {
        const plan = (this.readingPlans || []).find(p => p.id === id);
        if (!plan) return;

        this.resetReadingForm({ keepDates: true });

        const idEl = document.getElementById('readingPlanId');
        if (idEl) idEl.value = plan.id;
        const titleEl = document.getElementById('readingBookTitle');
        if (titleEl) titleEl.value = plan.title || '';
        const statusEl = document.getElementById('readingStatus');
        if (statusEl) statusEl.value = plan.status || '';
        const startEl = document.getElementById('readingStartDate');
        if (startEl) startEl.value = plan.startDate || '';
        const endEl = document.getElementById('readingEndDate');
        if (endEl) endEl.value = plan.endDate || '';

        const type = plan.recurrenceType || 'daily';
        const radio = document.querySelector(`input[name="readingRecurrenceType"][value="${type}"]`);
        if (radio) radio.checked = true;
        this.toggleReadingRecurrenceType(type);

        if (type === 'weekly') {
            const days = Array.isArray(plan?.recurrenceRule?.days) ? plan.recurrenceRule.days : [];
            document.querySelectorAll('input[name="readingWeekdays"]').forEach(cb => {
                cb.checked = days.includes(Number(cb.value));
            });
        }

        if (type === 'custom') {
            const rule = plan.recurrenceRule || {};
            const countEl = document.getElementById('readingCustomCount');
            if (countEl) countEl.value = rule.count || 1;
            const intervalEl = document.getElementById('readingCustomInterval');
            if (intervalEl) intervalEl.value = rule.interval || 1;
            const unitEl = document.getElementById('readingCustomUnit');
            if (unitEl) unitEl.value = rule.unit || 'day';
        }

        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.scrollTop = 0;
    }

    async deleteReadingPlan(id) {
        const plan = (this.readingPlans || []).find(p => p.id === id);
        if (!plan) return;
        const ok = confirm(`确定要删除读书计划「${plan.title}」吗？对应日历日程也会移除。`);
        if (!ok) return;

        this.deletePlanSchedules(id);
        this.readingPlans = (this.readingPlans || []).filter(p => p.id !== id);
        this.saveReadingPlans();
        this.renderReadingPlans();
        this.renderCalendar();
        this.renderScheduleList();

        await this.deleteReadingPlanFromApi(id);
    }

    async saveReadingPlan() {
        const data = this.validateReadingForm();
        if (!data) return;

        const now = new Date().toISOString();
        const idEl = document.getElementById('readingPlanId');
        const existingId = String(idEl?.value || '').trim();
        const planId = existingId || `reading-${Date.now().toString()}`;

        const prev = (this.readingPlans || []).find(p => p.id === planId);

        const plan = {
            id: planId,
            title: data.title,
            status: data.status,
            startDate: data.startDate,
            endDate: data.endDate,
            recurrenceType: data.recurrenceType,
            recurrenceRule: data.recurrenceRule,
            updatedAt: now,
            createdAt: prev?.createdAt || now
        };

        this.deletePlanSchedules(planId);

        const existingIndex = (this.readingPlans || []).findIndex(p => p.id === planId);
        if (existingIndex >= 0) {
            this.readingPlans[existingIndex] = plan;
        } else {
            this.readingPlans = Array.isArray(this.readingPlans) ? this.readingPlans : [];
            this.readingPlans.unshift(plan);
        }

        this.saveReadingPlans();
        this.syncReadingPlanToSchedules(plan);
        this.renderReadingPlans();
        this.renderCalendar();
        this.renderScheduleList();
        this.resetReadingForm({ keepDates: true });

        if (existingIndex >= 0) {
            await this.upsertReadingPlanToApi(plan);
        } else {
            const created = await this.createReadingPlanToApi(plan);
            if (!created) await this.upsertReadingPlanToApi(plan);
        }
    }

    // 更新今日信息
    updateTodayInfo() {
        const today = new Date();
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
        };
        
        const todayDateElement = document.getElementById('todayDate');
        if (todayDateElement) {
            todayDateElement.textContent = today.toLocaleDateString('zh-CN', options);
        }
        
        // 更新今日日程数量
        const todaySchedules = this.getSchedulesForDate(today);
        const count = todaySchedules.length;
        const todayScheduleCountElement = document.getElementById('todayScheduleCount');
        if (todayScheduleCountElement) {
            todayScheduleCountElement.textContent = count > 0 ? `今日有 ${count} 个日程` : '今日暂无日程安排';
        }
    }

    // 更新模块统计信息
    updateModuleStats() {
        const today = new Date();
        const todaySchedules = this.getSchedulesForDate(today);
        
        // 本月日程数量
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const monthSchedules = this.schedules.filter(schedule => {
            const scheduleDate = new Date(schedule.date);
            return scheduleDate.getMonth() === currentMonth && 
                   scheduleDate.getFullYear() === currentYear;
        });
        
        const todayTodoCount = document.getElementById('todayTodoCount');
        if (todayTodoCount) todayTodoCount.textContent = todaySchedules.length;
        const monthTodoCount = document.getElementById('monthTodoCount');
        if (monthTodoCount) monthTodoCount.textContent = monthSchedules.length;
        
        // 学习计划统计
        const activePlans = this.learningPlans.length;
        const todayPlanTasks = this.getTodayPlanTasksCount();
        
        const learningPlanCount = document.getElementById('learningPlanCount');
        if (learningPlanCount) learningPlanCount.textContent = activePlans;
        const todayPlanTasksCount = document.getElementById('todayPlanTasksCount');
        if (todayPlanTasksCount) todayPlanTasksCount.textContent = todayPlanTasks;
    }

    // 更新日期显示
    updateDateDisplay() {
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
        };
        document.getElementById('currentDate').textContent = 
            this.currentDate.toLocaleDateString('zh-CN', options);
    }

    // 渲染日历
    renderCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        // 更新月份显示
        const currentMonthEl = document.getElementById('currentMonth');
        if (currentMonthEl) {
            currentMonthEl.textContent = `${year}年${month + 1}月`;
        }

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        const calendarGrid = document.getElementById('calendarGrid');
        if (!calendarGrid) {
            return;
        }
        calendarGrid.innerHTML = '';

        // 添加上个月的日期
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startingDay - 1; i >= 0; i--) {
            const dayElement = this.createDayElement(
                prevMonthLastDay - i,
                month - 1,
                year,
                true
            );
            calendarGrid.appendChild(dayElement);
        }

        // 添加本月日期
        for (let day = 1; day <= daysInMonth; day++) {
            const dayElement = this.createDayElement(day, month, year, false);
            calendarGrid.appendChild(dayElement);
        }

        // 添加下个月的日期
        const totalCells = 42; // 6行 * 7列
        const remainingCells = totalCells - (startingDay + daysInMonth);
        for (let day = 1; day <= remainingCells; day++) {
            const dayElement = this.createDayElement(
                day,
                month + 1,
                year,
                true
            );
            calendarGrid.appendChild(dayElement);
        }
    }

    // 创建日期元素
    createDayElement(day, month, year, isOtherMonth) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        
        if (isOtherMonth) {
            dayElement.classList.add('other-month');
        }

        const date = new Date(year, month, day);
        const dateString = this.formatDate(date);
        
        // 检查是否是今天
        const today = new Date();
        if (this.isSameDate(date, today)) {
            dayElement.classList.add('today');
        }

        // 检查是否是选中的日期
        if (this.isSameDate(date, this.selectedDate)) {
            dayElement.classList.add('selected');
        }

        // 日期数字
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        dayElement.appendChild(dayNumber);

        // 日程指示器
        const daySchedules = this.getSchedulesForDate(date);
        
        // 总是显示日程列表容器，支持滑动功能
        const scheduleList = document.createElement('div');
        scheduleList.className = 'day-schedule-list';
        
        // 如果有日程，添加日程指示器和日程列表
        if (daySchedules.length > 0) {
            const scheduleDots = document.createElement('div');
            scheduleDots.className = 'day-schedules';
            
            // 按优先级显示点
            const priorities = ['high', 'medium', 'low'];
            priorities.forEach(priority => {
                const count = daySchedules.filter(s => s.priority === priority).length;
                if (count > 0) {
                    const dot = document.createElement('span');
                    dot.className = `schedule-dot ${priority}`;
                    scheduleDots.appendChild(dot);
                }
            });
            
            dayElement.appendChild(scheduleDots);
            
            // 按时间排序日程
            const sortedSchedules = daySchedules.sort((a, b) => {
                if (a.startTime && b.startTime) {
                    return a.startTime.localeCompare(b.startTime);
                }
                return 0;
            });
            
            // 显示所有日程（支持滑动）
            sortedSchedules.forEach(schedule => {
                const scheduleItem = document.createElement('div');
                scheduleItem.className = `day-schedule-item ${schedule.priority}`;
                
                // 显示时间和标题
                let displayText = schedule.title;
                if (schedule.startTime) {
                    if (schedule.endTime) {
                        displayText = `${schedule.startTime} - ${schedule.endTime} ${schedule.title}`;
                    } else {
                        displayText = `${schedule.startTime} ${schedule.title}`;
                    }
                }
                
                scheduleItem.textContent = displayText;
                scheduleItem.title = schedule.description || schedule.title;
                
                // 点击日程项跳转到详情
                scheduleItem.addEventListener('click', (e) => {
                    e.stopPropagation(); // 阻止冒泡到日期点击事件
                    this.selectDate(date);
                    this.highlightSchedule(schedule.id);
                });
                
                scheduleList.appendChild(scheduleItem);
            });
        }
        
        dayElement.appendChild(scheduleList);

        // 点击事件
        dayElement.addEventListener('click', () => {
            this.selectDate(date);
        });

        return dayElement;
    }

    // 选择日期
    selectDate(date) {
        this.selectedDate = date;
        this.renderCalendar();
        this.renderScheduleList();
        
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('selectedDateTitle').textContent = 
            `${date.toLocaleDateString('zh-CN', options)} 的日程`;
    }

    // 高亮显示特定日程
    highlightSchedule(scheduleId) {
        // 清除之前的高亮
        document.querySelectorAll('.schedule-item.highlighted').forEach(item => {
            item.classList.remove('highlighted');
        });
        
        // 高亮当前日程
        const scheduleItem = document.querySelector(`[data-schedule-id="${scheduleId}"]`);
        if (scheduleItem) {
            scheduleItem.classList.add('highlighted');
            scheduleItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    // 渲染日程列表
    renderScheduleList() {
        const scheduleList = document.getElementById('scheduleList');
        if (!scheduleList) {
            return;
        }
        const schedules = this.getSchedulesForDate(this.selectedDate);

        if (schedules.length === 0) {
            scheduleList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-plus"></i>
                    <p>这一天还没有日程安排</p>
                </div>
            `;
            return;
        }

        scheduleList.innerHTML = schedules.map(schedule => {
            let timeDisplay = '';
            if (schedule.startTime) {
                if (schedule.endTime) {
                    timeDisplay = `<span class="schedule-time">${schedule.startTime} - ${schedule.endTime}</span>`;
                } else {
                    timeDisplay = `<span class="schedule-time">${schedule.startTime}</span>`;
                }
            }
            
            return `
            <div class="schedule-item ${schedule.priority}" data-id="${schedule.id}">
                <div class="schedule-item-header">
                    <span class="schedule-title">${schedule.title}</span>
                    ${timeDisplay}
                </div>
                ${schedule.description ? `<div class="schedule-description">${schedule.description}</div>` : ''}
                <div class="schedule-actions">
                    <button class="btn btn-sm btn-danger delete-schedule">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        }).join('');

        // 添加删除事件
        scheduleList.querySelectorAll('.delete-schedule').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const scheduleItem = e.target.closest('.schedule-item');
                const scheduleId = scheduleItem.dataset.id;
                this.deleteSchedule(scheduleId);
            });
        });
    }

    // 显示日程模态框
    showScheduleModal() {
        const scheduleModal = document.getElementById('scheduleModal');
        if (!scheduleModal) return;
        scheduleModal.classList.add('active');
        document.getElementById('scheduleForm')?.reset();
    }

    // 隐藏日程模态框
    hideScheduleModal() {
        document.getElementById('scheduleModal')?.classList.remove('active');
    }

    // 保存日程
    saveSchedule() {
        const batchMode = document.getElementById('batchMode').checked;
        
        if (batchMode) {
            this.saveBatchSchedules();
        } else {
            // 单个日程保存
            const startTime = document.getElementById('scheduleStartTime').value;
            const endTime = document.getElementById('scheduleEndTime').value;
            
            // 时间验证
            if (startTime && endTime && startTime >= endTime) {
                alert('结束时间必须晚于开始时间');
                return;
            }
            
            const schedule = {
                id: Date.now().toString(),
                title: document.getElementById('scheduleTitle').value,
                startTime: startTime,
                endTime: endTime,
                description: document.getElementById('scheduleDescription').value,
                priority: document.getElementById('schedulePriority').value,
                date: this.formatDate(this.selectedDate)
            };

            this.schedules.push(schedule);
            this.saveSchedules();
            this.renderCalendar();
            this.renderScheduleList();
            this.hideScheduleModal();
            this.updateOverviewStats();
        }
    }
    
    // 保存批量日程
    saveBatchSchedules() {
        const batchText = document.getElementById('batchSchedules').value;
        const lines = batchText.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            alert('请输入至少一个日程');
            return;
        }
        
        const validPriorities = ['low', 'medium', 'high'];
        let validSchedules = [];
        let errors = [];
        
        lines.forEach((line, index) => {
            const fields = line.split(',').map(field => field.trim());
            
            // 验证字段数量
            if (fields.length < 5) {
                errors.push(`第 ${index + 1} 行：字段数量不足（至少需要5个字段）`);
                return;
            }
            
            const [title, startTime, endTime, description, priority] = fields;
            
            // 验证优先级
            if (!validPriorities.includes(priority)) {
                errors.push(`第 ${index + 1} 行：优先级必须是 low, medium 或 high`);
                return;
            }
            
            // 验证时间
            if (startTime && endTime && startTime >= endTime) {
                errors.push(`第 ${index + 1} 行：结束时间必须晚于开始时间`);
                return;
            }
            
            // 创建日程对象
            validSchedules.push({
                id: Date.now().toString() + '-' + index,
                title: title,
                startTime: startTime,
                endTime: endTime,
                description: description,
                priority: priority,
                date: this.formatDate(this.selectedDate)
            });
        });
        
        if (errors.length > 0) {
            alert('批量添加失败，以下是错误信息：\n' + errors.join('\n'));
            return;
        }
        
        // 添加所有有效日程
        this.schedules.push(...validSchedules);
        this.saveSchedules();
        this.renderCalendar();
        this.renderScheduleList();
        this.hideScheduleModal();
        this.updateOverviewStats();
    }

    // 删除日程
    deleteSchedule(scheduleId) {
        this.schedules = this.schedules.filter(s => s.id !== scheduleId);
        this.saveSchedules();
        this.renderCalendar();
        this.renderScheduleList();
        this.updateOverviewStats();
    }

    // 获取指定日期的日程
    getSchedulesForDate(date) {
        const dateString = this.formatDate(date);
        return this.schedules.filter(schedule => schedule.date === dateString);
    }

    // 格式化日期为 YYYY-MM-DD（本地时区）
    formatDate(date) {
        const d = new Date(date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // 检查两个日期是否相同
    isSameDate(date1, date2) {
        return this.formatDate(date1) === this.formatDate(date2);
    }

    // 加载日程数据
    loadSchedules() {
        try {
            const saved = localStorage.getItem('selfSystemSchedules');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('加载日程数据失败:', error);
            return [];
        }
    }

    // 保存日程数据
    saveSchedules() {
        try {
            localStorage.setItem('selfSystemSchedules', JSON.stringify(this.schedules));
        } catch (error) {
            console.error('保存日程数据失败:', error);
        }
    }

    // 启动日期自动更新
    startDateAutoUpdate() {
        // 每分钟更新一次日期显示
        setInterval(() => {
            this.updateDateDisplay();
            
            // 如果当前在学习系统，更新今日信息
            if (this.currentSystem === 'learning') {
                this.updateTodayInfo();
                this.updateModuleStats();
            }
        }, 60000); // 每分钟更新一次

        // 检查是否需要更新日历（跨天时）
        setInterval(() => {
            const now = new Date();
            if (now.getDate() !== this.currentDate.getDate()) {
                this.currentDate = now;
                if (this.currentSystem === 'learning' && 
                    (() => {
                        const todoCalendarModule = document.getElementById('todoCalendarModule');
                        return todoCalendarModule && todoCalendarModule.style.display !== 'none';
                    })()) {
                    this.renderCalendar();
                }
            }
        }, 1000); // 每秒检查一次
    }

    // 更新概览统计
    updateOverviewStats() {
        const learningTotal = Array.isArray(this.learningPlans) ? this.learningPlans.length : 0;
        const learningEl = document.getElementById('learning-total');
        if (learningEl) learningEl.textContent = String(learningTotal);

        const checklistTasks = this.getChecklistTodoTasksForDate(new Date());
        const checklistTotal = checklistTasks.filter(t => t.status !== 'completed').length;
        const checklistEl = document.getElementById('checklist-total');
        if (checklistEl) checklistEl.textContent = String(checklistTotal);

        const totalAssets = typeof this.calculateTotalAssets === 'function' ? this.calculateTotalAssets() : 0;
        const financeEl = document.getElementById('finance-total');
        if (financeEl) financeEl.textContent = `¥${Number(totalAssets || 0).toLocaleString()}`;

        const lifeTotal = Number(this.metamorphosisData?.currentStreak || 0) || 0;
        const lifeEl = document.getElementById('life-total');
        if (lifeEl) lifeEl.textContent = String(lifeTotal);

        const workEl = document.getElementById('work-total');
        if (workEl) workEl.textContent = '0';
        const wisdomEl = document.getElementById('wisdom-total');
        if (wisdomEl) wisdomEl.textContent = '0';
    }

    // 生成从当前时间到2030年的日历数据
    generateCalendarData() {
        const currentYear = this.currentDate.getFullYear();
        const targetYear = 2030;
        const calendarData = {};

        for (let year = currentYear; year <= targetYear; year++) {
            calendarData[year] = {};
            for (let month = 0; month < 12; month++) {
                const monthKey = `${year}-${month + 1}`;
                calendarData[year][monthKey] = this.getMonthData(year, month);
            }
        }

        return calendarData;
    }

    // 获取月份数据
    getMonthData(year, month) {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        return {
            year,
            month: month + 1,
            daysInMonth,
            startingDay,
            firstDay: firstDay.toISOString(),
            lastDay: lastDay.toISOString()
        };
    }

    // 快速定位到今日
    goToToday() {
        const today = new Date();
        this.currentDate = new Date(today);
        this.selectedDate = new Date(today);
        this.renderCalendar();
        this.renderScheduleList();
    }

    // 侧边栏展开/收缩功能
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const isCollapsed = sidebar.classList.contains('collapsed');
        
        if (isCollapsed) {
            this.expandSidebar();
        } else {
            this.collapseSidebar();
        }
    }

    // 展开侧边栏
    expandSidebar() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.remove('collapsed');
        
        // 更新切换图标
        const toggleIcon = sidebar.querySelector('.sidebar-toggle i');
        toggleIcon.className = 'fas fa-bars';
        
        // 保存状态到本地存储
        localStorage.setItem('sidebarCollapsed', 'false');
    }

    // 收缩侧边栏
    collapseSidebar() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.add('collapsed');
        
        // 更新切换图标
        const toggleIcon = sidebar.querySelector('.sidebar-toggle i');
        toggleIcon.className = 'fas fa-bars';
        
        // 保存状态到本地存储
        localStorage.setItem('sidebarCollapsed', 'true');
    }

    // 移动端侧边栏切换
    toggleMobileSidebar() {
        console.log('切换移动端侧边栏');
        const sidebar = document.getElementById('sidebar');
        const isShowing = sidebar.classList.contains('active');
        console.log('当前侧边栏状态:', isShowing ? '显示' : '隐藏');
        
        if (isShowing) {
            this.hideMobileSidebar();
        } else {
            this.showMobileSidebar();
        }
    }

    // 显示移动端侧边栏
    showMobileSidebar() {
        console.log('显示移动端侧边栏');
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.add('active');
        console.log('侧边栏添加active类');
        
        // 添加遮罩层
        this.createOverlay();
        console.log('遮罩层已创建');
    }

    // 隐藏移动端侧边栏
    hideMobileSidebar() {
        console.log('隐藏移动端侧边栏');
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.remove('active');
        console.log('侧边栏移除active类');
        
        // 移除遮罩层
        this.removeOverlay();
        console.log('遮罩层已移除');
    }

    // 创建遮罩层
    createOverlay() {
        if (document.getElementById('sidebarOverlay')) return;
        
        const overlay = document.createElement('div');
        overlay.id = 'sidebarOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 999;
            backdrop-filter: blur(2px);
            pointer-events: auto;
        `;
        
        overlay.addEventListener('click', () => {
            this.hideMobileSidebar();
        });
        
        document.body.appendChild(overlay);
    }

    // 移除遮罩层
    removeOverlay() {
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
            overlay.remove();
        }
    }

    // 初始化侧边栏状态
    initSidebarState() {
        const savedState = localStorage.getItem('sidebarCollapsed');
        const sidebar = document.getElementById('sidebar');
        
        if (savedState === 'true') {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.handleResize();
        });
        
        // 初始处理窗口大小
        this.handleResize();
    }

    // 处理窗口大小变化
    handleResize() {
        const isMobile = window.innerWidth <= 768;
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        if (!isMobile) {
            sidebar.classList.remove('active');
            this.removeOverlay();
            return;
        }

        if (!sidebar.classList.contains('active')) {
            this.removeOverlay();
        }
    }
    
    // ====================== 学习计划模块功能 ======================
    
    // 显示学习计划模态框
    showLearningPlanModal() {
        const modal = document.getElementById('learningPlanModal');
        const title = document.getElementById('learningPlanModalTitle');
        const form = document.getElementById('learningPlanForm');
        
        title.textContent = '添加学习计划';
        form.reset();
        
        // 设置默认日期
        const today = this.formatDate(this.currentDate);
        document.getElementById('planStartDate').value = today;
        document.getElementById('planEndDate').value = today;
        
        // 重置时间模式
        this.toggleTimeMode('period');
        this.toggleCustomDuration('30');
        this.toggleRecurrenceType('once');
        this.togglePlanBatchMode(false);
        
        modal.classList.add('active');
    }
    
    // 隐藏学习计划模态框
    hideLearningPlanModal() {
        document.getElementById('learningPlanModal')?.classList.remove('active');
    }
    
    // 切换时间模式
    toggleTimeMode(mode) {
        const periodContainer = document.getElementById('timePeriodContainer');
        const durationContainer = document.getElementById('timeDurationContainer');
        
        if (mode === 'period') {
            periodContainer.style.display = 'block';
            durationContainer.style.display = 'none';
            document.getElementById('planStartTime').required = true;
            document.getElementById('planEndTime').required = true;
            document.getElementById('planDurationStartTime').required = false;
        } else {
            periodContainer.style.display = 'none';
            durationContainer.style.display = 'block';
            document.getElementById('planStartTime').required = false;
            document.getElementById('planEndTime').required = false;
            document.getElementById('planDurationStartTime').required = true;
        }
    }

    togglePlanBatchMode(enabled) {
        const batchContainer = document.getElementById('planBatchContainer');
        const batchTitles = document.getElementById('planBatchTitles');
        const titleInput = document.getElementById('planTitle');
        const batchToggle = document.getElementById('planBatchMode');

        if (batchToggle) batchToggle.checked = Boolean(enabled);
        if (batchContainer) batchContainer.style.display = enabled ? 'block' : 'none';

        if (titleInput) titleInput.required = !enabled;
        if (batchTitles) batchTitles.required = enabled;
    }
    
    // 切换自定义时长显示
    toggleCustomDuration(value) {
        const customContainer = document.getElementById('customDurationContainer');
        customContainer.style.display = value === 'custom' ? 'block' : 'none';
    }
    
    // 切换重复类型
    toggleRecurrenceType(type) {
        const customContainer = document.getElementById('customRecurrenceContainer');
        
        if (type === 'custom') {
            customContainer.style.display = 'block';
        } else {
            customContainer.style.display = 'none';
        }
    }
    
    // 保存学习计划
    saveLearningPlan() {
        const formData = new FormData(document.getElementById('learningPlanForm'));
        const timeMode = formData.get('timeMode');
        const recurrenceType = formData.get('recurrenceType');
        const isBatchMode = Boolean(document.getElementById('planBatchMode')?.checked);

        const startDateValue = document.getElementById('planStartDate').value;
        const endDateValue = document.getElementById('planEndDate').value;

        if (!startDateValue || !endDateValue) {
            alert('请选择计划开始日期和结束日期');
            return;
        }
        if (startDateValue > endDateValue) {
            alert('结束日期不能早于开始日期');
            return;
        }
        const startDateObj = new Date(`${startDateValue}T00:00:00`);
        const startWeekday = startDateObj.getDay();
        const startDayOfMonth = startDateObj.getDate();
        
        // 构建时间设置
        let timeSettings = {};
        if (timeMode === 'period') {
            timeSettings = {
                mode: 'period',
                startTime: document.getElementById('planStartTime').value,
                endTime: document.getElementById('planEndTime').value
            };
        } else {
            const duration = document.getElementById('planDuration').value;
            timeSettings = {
                mode: 'duration',
                duration: duration === 'custom' ? 
                    parseInt(document.getElementById('planCustomDuration').value) : 
                    parseInt(duration),
                startTime: document.getElementById('planDurationStartTime').value
            };
        }

        if (timeSettings.mode === 'period') {
            if (!timeSettings.startTime || !timeSettings.endTime) {
                alert('请填写时间段的开始时间和结束时间');
                return;
            }
            if (timeSettings.startTime >= timeSettings.endTime) {
                alert('结束时间必须晚于开始时间');
                return;
            }
        } else {
            if (!timeSettings.startTime) {
                alert('请填写时长模式的开始时间');
                return;
            }
            if (!Number.isFinite(Number(timeSettings.duration)) || Number(timeSettings.duration) <= 0) {
                alert('请填写有效的时长（分钟）');
                return;
            }
        }
        
        // 构建重复规则
        let recurrenceRule = { type: recurrenceType };

        if (recurrenceType === 'once') {
            recurrenceRule = { type: 'once' };
        } else if (recurrenceType === 'daily') {
            recurrenceRule = {
                type: 'daily',
                interval: 1
            };
        } else if (recurrenceType === 'weekly') {
            recurrenceRule = {
                type: 'weekly',
                interval: 1,
                days: [startWeekday]
            };
        } else if (recurrenceType === 'monthly') {
            recurrenceRule = {
                type: 'monthly',
                interval: 1,
                dayOfMonth: startDayOfMonth
            };
        } else if (recurrenceType === 'single_week') {
            recurrenceRule = {
                type: 'single_week',
                interval: 2,
                parity: 0,
                days: [startWeekday]
            };
        } else if (recurrenceType === 'double_week') {
            recurrenceRule = {
                type: 'double_week',
                interval: 2,
                parity: 1,
                days: [startWeekday]
            };
        } else if (recurrenceType === 'custom') {
            const interval = parseInt(document.getElementById('recurrenceInterval').value);
            const unit = document.getElementById('recurrenceUnit').value;
            
            recurrenceRule = {
                type: 'custom',
                interval: interval,
                unit: unit
            };
            
            // 收集选中的星期几
            const weekdays = Array.from(document.querySelectorAll('input[name="weekdays"]:checked'))
                .map(checkbox => parseInt(checkbox.value));
            
            if (weekdays.length > 0) {
                recurrenceRule.days = weekdays;
                recurrenceRule.unit = 'week';
            }
        }

        const defaultDescription = document.getElementById('planDescription').value;
        const priority = document.getElementById('planPriority').value;

        const titles = (() => {
            if (isBatchMode) {
                const raw = document.getElementById('planBatchTitles')?.value || '';
                return raw
                    .split('\n')
                    .map(line => line.trim())
                    .filter(Boolean);
            }
            const singleTitle = document.getElementById('planTitle').value.trim();
            return singleTitle ? [singleTitle] : [];
        })();

        if (titles.length === 0) {
            alert(isBatchMode ? '请至少填写一行计划标题' : '请填写计划标题');
            return;
        }

        const now = Date.now().toString();
        const createdAt = new Date().toISOString();
        const newPlans = titles.map((line, index) => {
            const [rawTitle, rawDesc] = line.includes('|') ? line.split('|') : [line, ''];
            const titleText = (rawTitle || '').trim();
            const descText = (rawDesc || '').trim();

            return {
                id: `${now}-${index}`,
                title: titleText,
                description: descText || defaultDescription,
                timeSettings: timeSettings,
                recurrenceRule: recurrenceRule,
                startDate: startDateValue,
                endDate: endDateValue,
                priority: priority,
                createdAt: createdAt
            };
        }).filter(plan => plan.title);

        if (newPlans.length === 0) {
            alert('计划标题不能为空');
            return;
        }

        this.learningPlans.push(...newPlans);
        this.saveLearningPlans();
        
        // 自动同步到日程
        newPlans.forEach(plan => this.syncPlanToSchedules(plan));
        
        // 更新UI
        this.renderLearningPlans();
        this.updatePlanStats();
        this.updateModuleStats();
        this.hideLearningPlanModal();
    }
    
    // 删除学习计划
    deleteLearningPlan(planId) {
        this.learningPlans = this.learningPlans.filter(plan => plan.id !== planId);
        this.saveLearningPlans();
        
        // 删除相关的日程
        this.deletePlanSchedules(planId);
        
        // 更新UI
        this.renderLearningPlans();
        this.updatePlanStats();
        this.updateModuleStats();
        this.renderCalendar();
        this.renderScheduleList();
    }
    
    // 渲染学习计划列表
    renderLearningPlans() {
        const plansList = document.getElementById('learningPlansList');
        
        if (this.learningPlans.length === 0) {
          plansList.innerHTML = `
            <div class="empty-state">
              <i class="fas fa-calendar-alt"></i>
              <p>还没有创建学习计划</p>
              <p class="empty-hint">创建一个学习计划，开始你的学习之旅吧！</p>
              <button class="btn btn-primary start-creation-btn" onclick="app.showLearningPlanModal()">
                <i class="fas fa-plus-circle"></i>
                开始创建
              </button>
            </div>
          `;
          return;
        }
        
        // 按优先级排序
        const sortedPlans = [...this.learningPlans].sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
        
        plansList.innerHTML = sortedPlans.map(plan => {
            const startDate = new Date(plan.startDate).toLocaleDateString('zh-CN');
            const endDate = new Date(plan.endDate).toLocaleDateString('zh-CN');
            
            let timeDisplay = '';
            if (plan.timeSettings.mode === 'period') {
                timeDisplay = `${plan.timeSettings.startTime} - ${plan.timeSettings.endTime}`;
            } else {
                timeDisplay = `${plan.timeSettings.startTime}开始，${plan.timeSettings.duration}分钟`;
            }
            
            let recurrenceDisplay = '';
            if (plan.recurrenceRule.type === 'once') {
                recurrenceDisplay = '仅当天';
            } else if (plan.recurrenceRule.type === 'daily') {
                const interval = plan.recurrenceRule.interval || 1;
                recurrenceDisplay = interval === 1 ? '每天' : `每${interval}天`;
            } else if (plan.recurrenceRule.type === 'weekly') {
                const interval = plan.recurrenceRule.interval || 1;
                const days = Array.isArray(plan.recurrenceRule.days) ? plan.recurrenceRule.days : [];
                const daysText = days.length ? `（${this.formatWeekdays(days)}）` : '';
                recurrenceDisplay = interval === 1 ? `每周${daysText}` : `每${interval}周${daysText}`;
            } else if (plan.recurrenceRule.type === 'monthly') {
                const interval = plan.recurrenceRule.interval || 1;
                const dayOfMonth = plan.recurrenceRule.dayOfMonth || new Date(`${plan.startDate}T00:00:00`).getDate();
                recurrenceDisplay = interval === 1 ? `每月${dayOfMonth}日` : `每${interval}月${dayOfMonth}日`;
            } else if (plan.recurrenceRule.type === 'single_week') {
                const days = Array.isArray(plan.recurrenceRule.days) ? plan.recurrenceRule.days : [];
                const daysText = days.length ? `（${this.formatWeekdays(days)}）` : '';
                recurrenceDisplay = `单周${daysText}`;
            } else if (plan.recurrenceRule.type === 'double_week') {
                const days = Array.isArray(plan.recurrenceRule.days) ? plan.recurrenceRule.days : [];
                const daysText = days.length ? `（${this.formatWeekdays(days)}）` : '';
                recurrenceDisplay = `双周${daysText}`;
            } else {
                const interval = plan.recurrenceRule.interval || 1;
                const unit = plan.recurrenceRule.unit || 'day';
                const days = Array.isArray(plan.recurrenceRule.days) ? plan.recurrenceRule.days : [];
                if (days.length) {
                    recurrenceDisplay = `自定义，每${interval}周（${this.formatWeekdays(days)}）`;
                } else {
                    recurrenceDisplay = `自定义，每${interval}${this.getUnitText(unit)}`;
                }
            }
            
            return `
                <div class="learning-plan-item ${plan.priority}">
                    <div class="plan-item-header">
                        <h4 class="plan-title">${plan.title}</h4>
                        <div class="plan-priority">
                            <span class="priority-badge ${plan.priority}"></span>
                        </div>
                    </div>
                    <p class="plan-description">${plan.description || '无描述'}</p>
                    <div class="plan-details">
                        <div class="detail-item">
                            <i class="fas fa-clock"></i>
                            <span>${timeDisplay}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-repeat"></i>
                            <span>${recurrenceDisplay}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-calendar"></i>
                            <span>${startDate} 至 ${endDate}</span>
                        </div>
                    </div>
                    <div class="plan-actions">
                        <button class="btn btn-sm btn-danger delete-plan" data-plan-id="${plan.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // 添加删除事件
        plansList.querySelectorAll('.delete-plan').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const planId = e.target.closest('.delete-plan').dataset.planId;
                if (confirm('确定要删除这个学习计划吗？相关的日程也会被删除。')) {
                    this.deleteLearningPlan(planId);
                }
            });
        });
        
        // 渲染图表
        this.renderLearningChart();
    }
    
    // 获取时间单位文本
    getUnitText(unit) {
        const unitMap = { day: '天', week: '周', month: '月' };
        return unitMap[unit] || unit;
    }

    formatWeekdays(days) {
        const dayMap = ['日', '一', '二', '三', '四', '五', '六'];
        const unique = Array.from(new Set(days)).filter(d => d >= 0 && d <= 6).sort((a, b) => a - b);
        return unique.map(d => `周${dayMap[d]}`).join('、');
    }
    
    // 更新计划统计信息
    updatePlanStats() {
        const activePlans = this.learningPlans.length;
        const todayPlanTasks = this.getTodayPlanTasksCount();
        
        document.getElementById('activePlanCount').textContent = activePlans;
        document.getElementById('todayPlanTasks').textContent = todayPlanTasks;
        this.updateOverviewStats();
    }
    
    // 获取今日计划任务数量
    getTodayPlanTasksCount() {
        const today = this.formatDate(this.currentDate);
        let count = 0;
        
        this.learningPlans.forEach(plan => {
            // 检查计划是否在有效期内
            if (plan.startDate <= today && plan.endDate >= today) {
                // 检查是否在今天执行
                if (this.isPlanActiveToday(plan)) {
                    count++;
                }
            }
        });
        
        return count;
    }
    
    // 检查计划今天是否执行
    isPlanActiveToday(plan) {
        const today = new Date();
        const todayKey = this.formatDate(today);
        const startDate = new Date(`${plan.startDate}T00:00:00`);
        const startKey = this.formatDate(startDate);

        if (todayKey < plan.startDate || todayKey > plan.endDate) return false;

        const rule = plan.recurrenceRule || { type: 'once' };
        const interval = Number(rule.interval) || 1;

        const startDay = new Date(`${startKey}T00:00:00`);
        const todayDay = new Date(`${todayKey}T00:00:00`);
        const diffDays = Math.floor((todayDay - startDay) / (1000 * 60 * 60 * 24));
        const weekIndex = Math.floor(diffDays / 7);

        if (rule.type === 'once') {
            return todayKey === plan.startDate;
        }
        if (rule.type === 'daily') {
            return diffDays >= 0 && diffDays % interval === 0;
        }
        if (rule.type === 'weekly') {
            const days = Array.isArray(rule.days) ? rule.days : [startDate.getDay()];
            return diffDays >= 0 && weekIndex % interval === 0 && days.includes(todayDay.getDay());
        }
        if (rule.type === 'monthly') {
            const dayOfMonth = Number(rule.dayOfMonth) || startDate.getDate();
            const startMonthIndex = startDay.getFullYear() * 12 + startDay.getMonth();
            const todayMonthIndex = todayDay.getFullYear() * 12 + todayDay.getMonth();
            const monthDiff = todayMonthIndex - startMonthIndex;
            if (monthDiff < 0 || monthDiff % interval !== 0) return false;
            const lastDay = new Date(todayDay.getFullYear(), todayDay.getMonth() + 1, 0).getDate();
            const targetDay = Math.min(dayOfMonth, lastDay);
            return todayDay.getDate() === targetDay;
        }
        if (rule.type === 'single_week' || rule.type === 'double_week') {
            const days = Array.isArray(rule.days) ? rule.days : [startDate.getDay()];
            const parity = Number(rule.parity);
            const targetParity = rule.type === 'double_week' ? 1 : 0;
            const actualParity = Number.isFinite(parity) ? parity : targetParity;
            return diffDays >= 0 && weekIndex % 2 === actualParity && days.includes(todayDay.getDay());
        }
        if (rule.type === 'custom') {
            const unit = rule.unit || 'day';
            const days = Array.isArray(rule.days) ? rule.days : [];
            if (days.length) {
                return diffDays >= 0 && weekIndex % interval === 0 && days.includes(todayDay.getDay());
            }
            if (unit === 'day') {
                return diffDays >= 0 && diffDays % interval === 0;
            }
            if (unit === 'week') {
                return diffDays >= 0 && weekIndex % interval === 0 && todayDay.getDay() === startDay.getDay();
            }
            if (unit === 'month') {
                const startMonthIndex = startDay.getFullYear() * 12 + startDay.getMonth();
                const todayMonthIndex = todayDay.getFullYear() * 12 + todayDay.getMonth();
                const monthDiff = todayMonthIndex - startMonthIndex;
                return monthDiff >= 0 && monthDiff % interval === 0 && todayDay.getDate() === startDay.getDate();
            }
            return false;
        }
        return false;
    }
    
    // 同步学习计划到日程
    syncPlanToSchedules(plan) {
        // 计算所有需要生成日程的日期
        const dates = this.getPlanDates(plan);

        const todoSchedules = this.loadTodoCalendarSchedules();
        
        dates.forEach(date => {
            let startTime, endTime;

            const timeSettings = plan?.timeSettings || {};
            const mode = timeSettings.mode || 'period';
            const safeStartTime =
                typeof timeSettings.startTime === 'string' && timeSettings.startTime.includes(':')
                    ? timeSettings.startTime
                    : '00:00';

            if (mode === 'period') {
                startTime = safeStartTime;
                endTime =
                    typeof timeSettings.endTime === 'string' && timeSettings.endTime.includes(':')
                        ? timeSettings.endTime
                        : safeStartTime;
            } else {
                startTime = safeStartTime;
                const duration = Number(timeSettings.duration) || 0;
                endTime = this.calculateEndTime(startTime, duration);
            }
            
            // 创建日程
            const schedule = {
                id: `${plan.id}-${date}`,
                title: plan.title,
                description: `[学习计划] ${plan.description || ''}`,
                startTime: startTime,
                endTime: endTime,
                priority: plan.priority,
                date: date,
                planId: plan.id // 关联到学习计划
            };
            
            const existingIndex = this.schedules.findIndex(s => s.id === schedule.id);
            if (existingIndex >= 0) {
                this.schedules[existingIndex] = schedule;
            } else {
                this.schedules.push(schedule);
            }

            const dateKey = new Date(`${date}T00:00:00`).toDateString();
            if (!Array.isArray(todoSchedules[dateKey])) todoSchedules[dateKey] = [];
            const timeRangeText = startTime && endTime ? `${startTime}-${endTime}` : (startTime || '');
            const timeText = startTime || '';
            const contentText = `[学习计划] ${plan.title}${timeRangeText ? `（${timeRangeText}）` : ''}${plan.description ? ` - ${plan.description}` : ''}`;
            const todoItem = {
                id: schedule.id,
                time: timeText,
                content: contentText,
                priority: plan.priority,
                planId: plan.id
            };
            const todoExistingIndex = todoSchedules[dateKey].findIndex(s => s.id === todoItem.id);
            if (todoExistingIndex >= 0) {
                todoSchedules[dateKey][todoExistingIndex] = todoItem;
            } else {
                todoSchedules[dateKey].push(todoItem);
            }
        });
        
        this.saveSchedules();
        this.saveTodoCalendarSchedules(todoSchedules);
    }

    resyncLearningPlansToTodoCalendar() {
        if (!Array.isArray(this.learningPlans) || this.learningPlans.length === 0) return;
        this.learningPlans.forEach(plan => {
            if (!plan?.id) return;
            this.deletePlanSchedules(plan.id);
            this.syncPlanToSchedules(plan);
        });
    }

    loadTodoCalendarSchedules() {
        try {
            const saved = localStorage.getItem('todoSchedules');
            const parsed = saved ? JSON.parse(saved) : {};
            const normalized = {};
            const input = parsed && typeof parsed === 'object' ? parsed : {};
            Object.keys(input).forEach(dateKey => {
                const value = input[dateKey];
                if (Array.isArray(value)) {
                    normalized[dateKey] = value;
                    return;
                }
                if (value && typeof value === 'object') {
                    normalized[dateKey] = Object.values(value).filter(Boolean);
                    return;
                }
                normalized[dateKey] = [];
            });
            return normalized;
        } catch (error) {
            console.error('加载 Todo 日历日程失败:', error);
            return {};
        }
    }

    saveTodoCalendarSchedules(schedules) {
        try {
            localStorage.setItem('todoSchedules', JSON.stringify(schedules));
            if (this.todoCalendarInstance?.reloadSchedules) {
                this.todoCalendarInstance.reloadSchedules();
            } else if (this.todoCalendarInstance) {
                this.todoCalendarInstance.schedules = this.loadTodoCalendarSchedules();
                this.todoCalendarInstance.renderCalendar();
                this.todoCalendarInstance.updateSelectedDateInfo();
            }
        } catch (error) {
            console.error('保存 Todo 日历日程失败:', error);
        }
    }

    clearTodoCalendarLearningPlanSchedules() {
        const todoSchedules = this.loadTodoCalendarSchedules();
        let changed = false;
        Object.keys(todoSchedules).forEach(dateKey => {
            const before = Array.isArray(todoSchedules[dateKey]) ? todoSchedules[dateKey] : [];
            const after = before.filter(s => {
                const content = String(s?.content || '');
                const isLearning = content.startsWith('[学习计划]') || Boolean(s?.planId);
                return !isLearning;
            });
            if (after.length !== before.length) {
                changed = true;
                if (after.length === 0) {
                    delete todoSchedules[dateKey];
                } else {
                    todoSchedules[dateKey] = after;
                }
            }
        });
        if (changed) this.saveTodoCalendarSchedules(todoSchedules);
    }
    
    // 计算计划的所有日期
    getPlanDates(plan) {
        const startDate = new Date(`${plan.startDate}T00:00:00`);
        const endDate = new Date(`${plan.endDate}T00:00:00`);
        const dates = [];

        const rule = plan.recurrenceRule || { type: 'once' };
        const interval = Number(rule.interval) || 1;

        const pushDate = (d) => {
            if (d >= startDate && d <= endDate) dates.push(this.formatDate(d));
        };

        const dayDiff = (a, b) => Math.floor((b - a) / (1000 * 60 * 60 * 24));

        if (rule.type === 'once') {
            pushDate(startDate);
            return dates;
        }

        if (rule.type === 'daily') {
            let current = new Date(startDate);
            while (current <= endDate) {
                pushDate(current);
                current.setDate(current.getDate() + interval);
            }
            return dates;
        }

        const isWeeklyType = (type) => type === 'weekly' || type === 'single_week' || type === 'double_week';
        if (isWeeklyType(rule.type) || (rule.type === 'custom' && (rule.unit === 'week' || Array.isArray(rule.days)))) {
            const days = Array.isArray(rule.days) ? rule.days : [startDate.getDay()];
            let current = new Date(startDate);

            const parity =
                rule.type === 'double_week'
                    ? 1
                    : rule.type === 'single_week'
                        ? 0
                        : Number.isFinite(Number(rule.parity))
                            ? Number(rule.parity)
                            : null;

            while (current <= endDate) {
                const diff = dayDiff(startDate, current);
                const weekIndex = Math.floor(diff / 7);
                const inInterval = weekIndex >= 0 && weekIndex % interval === 0;
                const inParity = parity === null ? true : (weekIndex % 2 === parity);
                if (inInterval && inParity && days.includes(current.getDay())) {
                    pushDate(current);
                }
                current.setDate(current.getDate() + 1);
            }
            return dates;
        }

        if (rule.type === 'monthly' || (rule.type === 'custom' && rule.unit === 'month')) {
            const dayOfMonth = Number(rule.dayOfMonth) || startDate.getDate();
            let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            while (cursor <= endDate) {
                const monthDiff =
                    (cursor.getFullYear() * 12 + cursor.getMonth()) -
                    (startDate.getFullYear() * 12 + startDate.getMonth());
                if (monthDiff >= 0 && monthDiff % interval === 0) {
                    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
                    const targetDay = Math.min(dayOfMonth, lastDay);
                    const d = new Date(cursor.getFullYear(), cursor.getMonth(), targetDay);
                    pushDate(d);
                }
                cursor.setMonth(cursor.getMonth() + 1);
            }
            return dates;
        }

        if (rule.type === 'custom' && rule.unit === 'day') {
            let current = new Date(startDate);
            while (current <= endDate) {
                pushDate(current);
                current.setDate(current.getDate() + interval);
            }
            return dates;
        }

        if (rule.type === 'custom' && rule.unit === 'week') {
            let current = new Date(startDate);
            while (current <= endDate) {
                pushDate(current);
                current.setDate(current.getDate() + interval * 7);
            }
            return dates;
        }

        return dates;
    }
    
    // 计算结束时间
    calculateEndTime(startTime, durationMinutes) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const endDate = new Date();
        endDate.setHours(hours);
        endDate.setMinutes(minutes + durationMinutes);
        
        const endHours = endDate.getHours().toString().padStart(2, '0');
        const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
        
        return `${endHours}:${endMinutes}`;
    }
    
    // 删除学习计划相关的所有日程
    deletePlanSchedules(planId) {
        this.schedules = this.schedules.filter(schedule => schedule.planId !== planId);
        this.saveSchedules();

        const todoSchedules = this.loadTodoCalendarSchedules();
        let changed = false;
        Object.keys(todoSchedules).forEach(dateKey => {
            const before = Array.isArray(todoSchedules[dateKey]) ? todoSchedules[dateKey] : [];
            const after = before.filter(s => s?.planId !== planId && !String(s?.id || '').startsWith(`${planId}-`));
            if (after.length !== before.length) {
                changed = true;
                if (after.length === 0) {
                    delete todoSchedules[dateKey];
                } else {
                    todoSchedules[dateKey] = after;
                }
            }
        });
        if (changed) this.saveTodoCalendarSchedules(todoSchedules);
    }
    
    // 加载学习计划数据
    loadLearningPlans() {
        try {
            const saved = localStorage.getItem('selfSystemLearningPlans');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('加载学习计划数据失败:', error);
            return [];
        }
    }
    
    // 保存学习计划数据
    saveLearningPlans() {
        try {
            localStorage.setItem('selfSystemLearningPlans', JSON.stringify(this.learningPlans));
        } catch (error) {
            console.error('保存学习计划数据失败:', error);
        }
    }

    // 导出学习计划数据
    exportLearningPlans() {
        try {
            const dataStr = JSON.stringify(this.learningPlans, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `learning_plans_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('导出学习计划失败:', error);
            alert('导出失败: ' + error.message);
        }
    }

    // 导入学习计划数据
    importLearningPlans(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const plans = JSON.parse(e.target.result);
                
                // 简单的验证
                if (!Array.isArray(plans)) {
                    throw new Error('无效的学习计划数据格式');
                }
                
                if (confirm(`准备导入 ${plans.length} 个学习计划，这将覆盖现有计划。确定要继续吗？`)) {
                    this.learningPlans = plans;
                    this.saveLearningPlans();
                    
                    // 重新生成日程
                    // 先删除旧的学习计划相关日程
                    this.schedules = this.schedules.filter(s => !s.planId);
                    this.clearTodoCalendarLearningPlanSchedules();
                    
                    // 为新计划生成日程
                    this.learningPlans.forEach(plan => {
                        this.syncPlanToSchedules(plan);
                    });
                    
                    // 刷新UI
                    this.renderLearningPlans();
                    this.updatePlanStats();
                    this.updateModuleStats();
                    this.renderCalendar();
                    this.renderScheduleList();
                    
                    alert('学习计划导入成功！');
                }
            } catch (error) {
                console.error('导入失败:', error);
                alert('导入失败: ' + error.message);
            }
            
            // 清空文件输入
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    // 渲染学习计划图表
    renderLearningChart() {
        const ctx = document.getElementById('learningPlanChart');
        if (!ctx) return;
        
        // 准备数据：按优先级统计
        const priorityCounts = {
            high: 0,
            medium: 0,
            low: 0
        };
        
        this.learningPlans.forEach(plan => {
            if (priorityCounts[plan.priority] !== undefined) {
                priorityCounts[plan.priority]++;
            }
        });
        
        const data = [priorityCounts.high, priorityCounts.medium, priorityCounts.low];
        const labels = ['高优先级', '中优先级', '低优先级'];
        const backgroundColors = ['#ff4d4f', '#faad14', '#52c41a'];
        
        // 如果没有数据，隐藏图表
        if (this.learningPlans.length === 0) {
            ctx.parentElement.style.display = 'none';
            return;
        } else {
            ctx.parentElement.style.display = 'block';
        }
        
        // 销毁旧图表
        if (this.learningChartInstance) {
            this.learningChartInstance.destroy();
        }
        
        // 创建新图表
        try {
            if (typeof Chart !== 'undefined') {
                this.learningChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: '学习计划数量',
                            data: data,
                            backgroundColor: backgroundColors,
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: '学习计划优先级分布',
                                color: '#ffffff'
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    stepSize: 1,
                                    color: '#ffffff'
                                },
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.1)'
                                }
                            },
                            x: {
                                ticks: {
                                    color: '#ffffff'
                                },
                                grid: {
                                    display: false
                                }
                            }
                        }
                    }
                });
            } else {
                console.warn('Chart.js not loaded');
            }
        } catch (e) {
            console.error('Chart.js creation failed:', e);
        }
    }
    
    // ====================== 学习计划模块功能结束 ======================

    // ====================== 清单系统模块功能 ======================

    loadChecklistCheckins() {
        try {
            const saved = localStorage.getItem('selfSystemChecklistCheckins');
            const parsed = saved ? JSON.parse(saved) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.error('加载清单打卡数据失败:', error);
            return {};
        }
    }

    saveChecklistCheckins() {
        try {
            localStorage.setItem('selfSystemChecklistCheckins', JSON.stringify(this.checklistCheckins || {}));
        } catch (error) {
            console.error('保存清单打卡数据失败:', error);
        }
    }

    getChecklistCheckinKey(dateKey, scheduleId) {
        return `${String(dateKey || '')}::${String(scheduleId || '')}`;
    }

    isTodoExamSchedule(schedule) {
        if (!schedule || typeof schedule !== 'object') return false;
        if (schedule.timetableCourseType === 'exam') return true;
        const content = String(schedule.content || '');
        return content.startsWith('[考试]');
    }

    formatTimeHHMM(date) {
        const d = date instanceof Date ? date : new Date(date);
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    getVisibleTodoDaySchedules(date, daySchedules) {
        const list = Array.isArray(daySchedules) ? daySchedules : [];
        const d = date instanceof Date ? date : new Date(date);
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) return list;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const isPast = day.getTime() < today.getTime();
        const isToday = day.getTime() === today.getTime();
        const nowTime = this.formatTimeHHMM(now);

        return list.filter((schedule) => {
            if (!this.isTodoExamSchedule(schedule)) return true;
            if (isPast) return false;
            if (isToday) {
                const endTime = String(schedule?.timetableEndTime || '');
                const startTime = String(schedule?.time || '');
                const compareTime = endTime || startTime;
                if (compareTime && compareTime < nowTime) return false;
            }
            return true;
        });
    }

    getChecklistTodoTasksForDate(date) {
        const d = date instanceof Date ? date : new Date(date);
        const dateKey = d.toDateString();
        const todoSchedules = this.loadTodoCalendarSchedules();
        const daySchedules = Array.isArray(todoSchedules[dateKey]) ? todoSchedules[dateKey] : [];
        const visible = this.getVisibleTodoDaySchedules(d, daySchedules);
        return visible.map((s) => {
            const id = String(s?.id || '');
            const key = this.getChecklistCheckinKey(dateKey, id);
            const status = String(this.checklistCheckins?.[key]?.status || 'pending');
            return {
                key,
                id,
                dateKey,
                time: String(s?.time || ''),
                content: String(s?.content || ''),
                priority: s?.priority === 'high' || s?.priority === 'low' ? s.priority : 'medium',
                status: status === 'completed' || status === 'in_progress' ? status : 'pending'
            };
        });
    }

    getChecklistStatusLabel(status) {
        if (status === 'completed') return '已完成';
        if (status === 'in_progress') return '进行中';
        return '待处理';
    }

    toggleChecklistScheduleCompletion(scheduleId, dateKey) {
        const id = String(scheduleId || '');
        const dayKey = String(dateKey || '');
        if (!id || !dayKey) return;

        const key = this.getChecklistCheckinKey(dayKey, id);
        const current = String(this.checklistCheckins?.[key]?.status || 'pending');
        const next = current === 'completed' ? 'pending' : 'completed';
        this.checklistCheckins[key] = { status: next, updatedAt: new Date().toISOString() };
        this.saveChecklistCheckins();
        this.renderChecklist();
        this.updateChecklistStats();
        this.updateOverviewStats();
    }

    toggleChecklistScheduleInProgress(scheduleId, dateKey) {
        const id = String(scheduleId || '');
        const dayKey = String(dateKey || '');
        if (!id || !dayKey) return;

        const key = this.getChecklistCheckinKey(dayKey, id);
        const current = String(this.checklistCheckins?.[key]?.status || 'pending');
        if (current === 'completed') return;
        const next = current === 'in_progress' ? 'pending' : 'in_progress';
        this.checklistCheckins[key] = { status: next, updatedAt: new Date().toISOString() };
        this.saveChecklistCheckins();
        this.renderChecklist();
        this.updateChecklistStats();
        this.updateOverviewStats();
    }

    // 加载清单任务
    loadChecklistTasks() {
        try {
            const saved = localStorage.getItem('selfSystemChecklistTasks');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('加载清单任务失败:', error);
            return [];
        }
    }

    // 保存清单任务
    saveChecklistTasks() {
        try {
            localStorage.setItem('selfSystemChecklistTasks', JSON.stringify(this.checklistTasks));
        } catch (error) {
            console.error('保存清单任务失败:', error);
        }
    }

    // 显示清单模态框
    showChecklistModal(taskId = null) {
        const modal = document.getElementById('checklistModal');
        const form = document.getElementById('checklistForm');
        const title = document.getElementById('checklistModalTitle');
        
        form.reset();
        document.getElementById('checklistTaskId').value = '';
        
        if (taskId) {
            title.textContent = '编辑任务';
            const task = this.checklistTasks.find(t => t.id === taskId);
            if (task) {
                document.getElementById('checklistTaskId').value = task.id;
                document.getElementById('checklistTitle').value = task.title;
                document.getElementById('checklistDescription').value = task.description || '';
                document.getElementById('checklistPriority').value = task.priority;
                document.getElementById('checklistStatus').value = task.status;
            }
        } else {
            title.textContent = '添加任务';
        }
        
        modal.classList.add('active');
    }

    // 隐藏清单模态框
    hideChecklistModal() {
        const modal = document.getElementById('checklistModal');
        modal.classList.remove('active');
    }

    // 保存清单任务
    saveChecklistTask() {
        const taskId = document.getElementById('checklistTaskId').value;
        const title = document.getElementById('checklistTitle').value;
        const description = document.getElementById('checklistDescription').value;
        const priority = document.getElementById('checklistPriority').value;
        const status = document.getElementById('checklistStatus').value;
        
        if (taskId) {
            // 编辑现有任务
            const taskIndex = this.checklistTasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
                this.checklistTasks[taskIndex] = {
                    ...this.checklistTasks[taskIndex],
                    title,
                    description,
                    priority,
                    status,
                    updatedAt: new Date().toISOString()
                };
            }
        } else {
            // 创建新任务
            const newTask = {
                id: Date.now().toString(),
                title,
                description,
                priority,
                status,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.checklistTasks.push(newTask);
        }
        
        this.saveChecklistTasks();
        this.renderChecklist();
        this.updateChecklistStats();
        this.updateOverviewStats();
        this.hideChecklistModal();
    }

    // 删除清单任务
    deleteChecklistTask(taskId) {
        if (confirm('确定要删除这个任务吗？')) {
            this.checklistTasks = this.checklistTasks.filter(t => t.id !== taskId);
            this.saveChecklistTasks();
            this.renderChecklist();
            this.updateChecklistStats();
            this.updateOverviewStats();
        }
    }

    // 切换任务状态（完成/未完成）
    toggleChecklistTask(taskId) {
        const task = this.checklistTasks.find(t => t.id === taskId);
        if (task) {
            task.status = task.status === 'completed' ? 'pending' : 'completed';
            task.updatedAt = new Date().toISOString();
            this.saveChecklistTasks();
            this.renderChecklist();
            this.updateChecklistStats();
            this.updateOverviewStats();
        }
    }

    // 渲染清单列表
    renderChecklist() {
        const container = document.getElementById('checklistTaskContainer');
        if (!container) return;

        const tasks = this.getChecklistTodoTasksForDate(new Date());
        if (tasks.length === 0) {
            container.innerHTML = `
                <div class="pwa-empty-state">
                    <i class="fas fa-list-check"></i>
                    <h3>还没有任务</h3>
                    <p>点击"添加任务"到待办日程里创建今日日程</p>
                </div>
            `;
            return;
        }

        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const statusOrder = { pending: 0, in_progress: 1, completed: 2 };
        const sortedTasks = [...tasks].sort((a, b) => {
            const aStatus = statusOrder[a.status] ?? 0;
            const bStatus = statusOrder[b.status] ?? 0;
            if (aStatus !== bStatus) return aStatus - bStatus;
            const ap = priorityOrder[a.priority] ?? 1;
            const bp = priorityOrder[b.priority] ?? 1;
            if (ap !== bp) return ap - bp;
            return String(a.time || '').localeCompare(String(b.time || ''));
        });

        container.innerHTML = sortedTasks.map(task => `
            <div class="checklist-item ${task.priority} ${task.status === 'completed' ? 'completed' : ''}">
                <div class="checklist-checkbox" onclick="selfSystem.toggleChecklistScheduleCompletion('${task.id}', '${task.dateKey}')">
                    <i class="fas ${task.status === 'completed' ? 'fa-check-circle' : 'fa-circle'}"></i>
                </div>
                <div class="checklist-content">
                    <div class="checklist-header">
                        <span class="checklist-title">${task.content}</span>
                        <span class="checklist-badge ${task.priority}">${this.getPriorityLabel(task.priority)}</span>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="selfSystem.toggleChecklistScheduleInProgress('${task.id}', '${task.dateKey}')">
                            ${this.getChecklistStatusLabel(task.status)}
                        </button>
                    </div>
                    ${task.time ? `<p class="checklist-desc">${task.time}</p>` : ''}
                </div>
            </div>
        `).join('');
    }
    
    // 获取优先级标签
    getPriorityLabel(priority) {
        const labels = { high: '高', medium: '中', low: '低' };
        return labels[priority] || priority;
    }

    // 更新清单统计
    updateChecklistStats() {
        const tasks = this.getChecklistTodoTasksForDate(new Date());
        const pendingOrInProgress = tasks.filter(t => t.status !== 'completed');
        const completed = tasks.filter(t => t.status === 'completed');
        const inProgress = tasks.filter(t => t.status === 'in_progress');

        const todayEl = document.getElementById('checklistTodayCount');
        if (todayEl) todayEl.textContent = String(pendingOrInProgress.length);
        const completedEl = document.getElementById('checklistCompletedCount');
        if (completedEl) completedEl.textContent = String(completed.length);
        const inProgressEl = document.getElementById('checklistInProgressCount');
        if (inProgressEl) inProgressEl.textContent = String(inProgress.length);
    }

    // ====================== 清单系统模块功能结束 ======================
    
    // 处理窗口大小变化
    handleResize() {
        const isMobile = window.innerWidth <= 768;
        const sidebar = document.getElementById('sidebar');
        
        if (isMobile) {
            // 移动端模式
            sidebar.classList.remove('collapsed');
            this.hideMobileSidebar();
        } else {
            // 桌面端模式
            this.removeOverlay();
            sidebar.classList.remove('active');
        }
    }

    // ====================== 财务系统模块功能 ======================

    // 显示财务系统主页
    showFinanceHome() {
        document.querySelectorAll('.finance-module-page').forEach(page => {
            page.style.display = 'none';
            page.classList.remove('show-module');
        });
        document.getElementById('financeHome').style.display = 'block';
        this.updateFinanceTodayInfo();
        this.updateFinanceModuleStats();
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.scrollTop = 0;
    }

    // 显示财务模块
    showFinanceModule(module) {
        console.log('[Debug] showFinanceModule called with module:', module);

        if (this.currentSystem !== 'finance') {
            this.showSystem('finance');
            window.requestAnimationFrame(() => this.showFinanceModule(module));
            return;
        }
        
        // 隐藏财务主页
        document.getElementById('financeHome').style.display = 'none';
        
        // 隐藏所有财务模块页面
        document.querySelectorAll('.finance-module-page').forEach(page => {
            page.style.display = 'none';
            page.classList.remove('show-module');
        });
        
        if (module === 'financeDashboard') {
            const moduleElement = document.getElementById('financeDashboardModule');
            console.log('[Debug] Showing finance dashboard module:', moduleElement);
            if (moduleElement) {
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
                this.showFinanceDashboard();
            } else {
                console.error('[Debug] Finance dashboard module element not found');
            }
        } else if (module === 'assets') {
            const moduleElement = document.getElementById('assetsModule');
            console.log('[Debug] Showing assets module:', moduleElement);
            if (moduleElement) {
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
                this.showAssetsModule();
            } else {
                console.error('[Debug] Assets module element not found');
            }
        } else if (module === 'repaymentPlans') {
            const moduleElement = document.getElementById('repaymentPlansModule');
            console.log('[Debug] Showing repayment plans module:', moduleElement);
            if (moduleElement) {
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
                this.showRepaymentPlans();
            } else {
                console.error('[Debug] Repayment plans module element not found');
            }
        } else if (module === 'savings') {
            const moduleElement = document.getElementById('savingsModule');
            console.log('显示储蓄模块:', moduleElement);
            if (moduleElement) {
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
                this.showSavingsModule();
            } else {
                console.error('找不到储蓄模块元素');
            }
        } else if (module === 'investments') {
            const moduleElement = document.getElementById('investmentsModule');
            console.log('显示投资模块:', moduleElement);
            if (moduleElement) {
                moduleElement.style.display = 'block';
                moduleElement.classList.add('show-module');
                this.showInvestmentsModule();
            } else {
                console.error('找不到投资模块元素');
            }
        }
        
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.scrollTop = 0;
    }

    // 显示财务仪表盘
    showFinanceDashboard() {
        this.updateFinanceDashboard();
    }

    // 更新财务仪表盘数据
    updateFinanceDashboard() {
        // 计算总资产
        const totalAssets = this.calculateTotalAssets();
        document.getElementById('dashboardTotalAssets').textContent = `¥${totalAssets.toLocaleString()}`;
        
        // 计算总负债
        const totalLiabilities = this.calculateTotalLiabilities();
        document.getElementById('dashboardTotalLiabilities').textContent = `¥${totalLiabilities.toLocaleString()}`;
        
        // 计算净资产
        const netWorth = totalAssets - totalLiabilities;
        document.getElementById('dashboardNetWorth').textContent = `¥${netWorth.toLocaleString()}`;
        
        // 计算本月收入
        const monthlyIncome = this.calculateMonthlyIncome();
        document.getElementById('dashboardMonthlyIncome').textContent = `¥${monthlyIncome.toLocaleString()}`;
        
        // 计算本月支出
        const monthlyExpenses = this.calculateMonthlyExpenses();
        document.getElementById('dashboardMonthlyExpenses').textContent = `¥${monthlyExpenses.toLocaleString()}`;
        
        // 计算储蓄率
        const savingsRate = monthlyIncome > 0 ? Math.round((monthlyIncome - monthlyExpenses) / monthlyIncome * 100) : 0;
        document.getElementById('dashboardSavingsRate').textContent = `${savingsRate}%`;
    }

    // 计算总资产
    calculateTotalAssets() {
        let total = 0;
        
        // 计算银行账户
        if (this.financeData.bankAccounts) {
            this.financeData.bankAccounts.forEach(account => {
                total += account.balance || 0;
            });
        }
        
        // 计算投资
        if (this.financeData.investments) {
            this.financeData.investments.forEach(investment => {
                total += investment.currentValue || 0;
            });
        }
        
        // 计算固定资产
        if (this.financeData.fixedAssets) {
            this.financeData.fixedAssets.forEach(asset => {
                total += asset.value || 0;
            });
        }
        
        return total;
    }

    // 计算总负债
    calculateTotalLiabilities() {
        let total = 0;
        
        // 计算贷款
        if (this.financeData.loans) {
            this.financeData.loans.forEach(loan => {
                total += loan.balance || 0;
            });
        }
        
        // 计算信用卡
        if (this.financeData.creditCards) {
            this.financeData.creditCards.forEach(card => {
                total += card.balance || 0;
            });
        }
        
        return total;
    }

    // 计算本月收入
    calculateMonthlyIncome() {
        let total = 0;
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        // 计算本月交易收入
        if (this.financeData.transactions) {
            this.financeData.transactions.forEach(transaction => {
                const transactionDate = new Date(transaction.date);
                if (transactionDate.getMonth() === currentMonth && 
                    transactionDate.getFullYear() === currentYear && 
                    transaction.type === 'income') {
                    total += transaction.amount || 0;
                }
            });
        }
        
        return total;
    }

    // 计算本月支出
    calculateMonthlyExpenses() {
        let total = 0;
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        // 计算本月交易支出
        if (this.financeData.transactions) {
            this.financeData.transactions.forEach(transaction => {
                const transactionDate = new Date(transaction.date);
                if (transactionDate.getMonth() === currentMonth && 
                    transactionDate.getFullYear() === currentYear && 
                    transaction.type === 'expense') {
                    total += transaction.amount || 0;
                }
            });
        }
        
        return total;
    }

    // 更新财务系统今日信息
    updateFinanceTodayInfo() {
        const today = new Date();
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
        };
        
        const financeTodayDateElement = document.getElementById('financeTodayDate');
        if (financeTodayDateElement) {
            financeTodayDateElement.textContent = today.toLocaleDateString('zh-CN', options);
        }
    }

    // 更新财务模块统计信息
    updateFinanceModuleStats() {
        const totalAssets = this.calculateTotalAssets();
        const totalLiabilities = this.calculateTotalLiabilities();
        
        document.getElementById('totalAssets').textContent = `¥${totalAssets.toLocaleString()}`;
        document.getElementById('totalLiabilities').textContent = `¥${totalLiabilities.toLocaleString()}`;
        
        // 更新其他模块统计
        document.getElementById('assetCategories').textContent = this.financeData.assetCategories?.length || 0;
        document.getElementById('assetCount').textContent = this.calculateTotalAssetCount();
        document.getElementById('repaymentAmount').textContent = `¥${totalLiabilities.toLocaleString()}`;
        document.getElementById('repaymentCount').textContent = this.calculateTotalRepaymentCount();
        document.getElementById('savingsGoal').textContent = `¥${(this.financeData.savingsGoal || 0).toLocaleString()}`;
        document.getElementById('savingsAmount').textContent = `¥${(this.calculateTotalSavings() || 0).toLocaleString()}`;
        document.getElementById('investmentCount').textContent = this.financeData.investments?.length || 0;
        document.getElementById('investmentReturn').textContent = `¥${(this.calculateTotalInvestmentReturn() || 0).toLocaleString()}`;
    }

    // 计算总资产数量
    calculateTotalAssetCount() {
        let count = 0;
        if (this.financeData.bankAccounts) count += this.financeData.bankAccounts.length;
        if (this.financeData.investments) count += this.financeData.investments.length;
        if (this.financeData.fixedAssets) count += this.financeData.fixedAssets.length;
        return count;
    }

    // 计算总还款计划数量
    calculateTotalRepaymentCount() {
        let count = 0;
        if (this.financeData.loans) count += this.financeData.loans.length;
        if (this.financeData.creditCards) count += this.financeData.creditCards.length;
        return count;
    }

    // 计算总储蓄金额
    calculateTotalSavings() {
        let total = 0;
        if (this.financeData.savingsAccounts) {
            this.financeData.savingsAccounts.forEach(account => {
                total += account.balance || 0;
            });
        }
        return total;
    }

    // 计算总投资收益
    calculateTotalInvestmentReturn() {
        let total = 0;
        if (this.financeData.investments) {
            this.financeData.investments.forEach(investment => {
                const returnAmount = (investment.currentValue || 0) - (investment.purchasePrice || 0);
                total += returnAmount;
            });
        }
        return total;
    }

    calculateTotalInvestments() {
        let total = 0;
        const investments = Array.isArray(this.financeData?.investments) ? this.financeData.investments : [];
        investments.forEach(investment => {
            const value = Number(investment?.currentValue ?? investment?.value ?? investment?.principal ?? investment?.purchasePrice ?? 0) || 0;
            total += value;
        });
        return total;
    }
    
    // 显示还款计划模块
    async showRepaymentPlans() {
        // 加载还款数据
        await this.loadRepaymentData();
        
        // 更新还款概览指标
        this.updateRepaymentOverview();
        
        // 渲染还款计划列表
        this.renderRepaymentPlans();
        
        this.renderUpcomingPayments();
        this.renderPaymentRecords();
        this.syncRepaymentToTodoCalendar();
    }
    
    // 导出还款数据
    exportRepaymentData() {
        if (!this.repaymentData) {
            alert('没有可导出的数据');
            return;
        }
        
        const dataStr = JSON.stringify(this.repaymentData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `repayment_data_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        document.body.appendChild(linkElement);
        linkElement.click();
        document.body.removeChild(linkElement);
    }

    // 加载还款数据
    async loadRepaymentData(forceRefresh = false) {
        try {
            let loaded = false;
            
            // 如果不是强制刷新，尝试从localStorage加载
            if (!forceRefresh) {
                const saved = localStorage.getItem('selfSystemRepaymentData');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    this.repaymentData = this.normalizeRepaymentData(parsed);
                    // 检查数据是否有效（非空）
                    if ((this.repaymentData.loans && this.repaymentData.loans.length > 0) || 
                        (this.repaymentData.creditCards && this.repaymentData.creditCards.length > 0)) {
                        loaded = true;
                    }
                }
            }
            
            // 如果未加载或需要强制刷新，尝试从后端解析 Excel 加载
            if (!loaded) {
                try {
                    const apiUrl = new URL('/api/repayment/raw', window.location.href);
                    const response = await fetch(apiUrl.toString(), { cache: 'no-store' });
                    if (response.ok) {
                        const payload = await response.json();
                        const rows = Array.isArray(payload?.rows) ? payload.rows : null;
                        if (rows) {
                            this.repaymentData = this.normalizeRepaymentData(rows);
                            this.saveRepaymentData();
                            loaded = true;
                        }
                    } else {
                        console.warn('加载 /api/repayment/raw 失败，HTTP 状态:', response.status);
                    }
                } catch (error) {
                    console.error('加载 /api/repayment/raw 失败:', error);
                }
            }

            // 如果未加载或需要强制刷新，尝试从JSON文件加载
            if (!loaded) {
                try {
                    const repaymentDataUrl = new URL('repayment_data.json', window.location.href);
                    const response = await fetch(repaymentDataUrl.toString());
                    if (response.ok) {
                        const rawData = await response.json();
                        this.repaymentData = this.normalizeRepaymentData(rawData);
                        this.saveRepaymentData();
                        loaded = true;
                    } else {
                        console.warn('加载 repayment_data.json 失败，HTTP 状态:', response.status);
                    }
                } catch (error) {
                    console.error('加载 repayment_data.json 失败:', error);
                }
            }
            
            const normalized = this.normalizeRepaymentData(this.repaymentData);
            const hasPlans =
                (normalized.loans && normalized.loans.length > 0) ||
                (normalized.creditCards && normalized.creditCards.length > 0);

            this.repaymentData = normalized;

            if (!hasPlans) {
                this.repaymentData = this.getDefaultRepaymentData();
                this.saveRepaymentData();
            }
        } catch (error) {
            console.error('加载还款数据失败:', error);
            this.repaymentData = this.getDefaultRepaymentData();
        }
    }

    normalizeRepaymentData(rawData) {
        if (Array.isArray(rawData)) {
            const parsed = this.parseRepaymentData(rawData);
            return {
                loans: Array.isArray(parsed?.loans) ? parsed.loans : [],
                creditCards: Array.isArray(parsed?.creditCards) ? parsed.creditCards : [],
                paymentRecords: Array.isArray(parsed?.paymentRecords) ? parsed.paymentRecords : []
            };
        }
        
        if (!rawData || typeof rawData !== 'object') {
            return { loans: [], creditCards: [], paymentRecords: [] };
        }
        
        if (Array.isArray(rawData.loans) || Array.isArray(rawData.creditCards)) {
            return {
                loans: Array.isArray(rawData.loans) ? rawData.loans : [],
                creditCards: Array.isArray(rawData.creditCards) ? rawData.creditCards : [],
                paymentRecords: Array.isArray(rawData.paymentRecords) ? rawData.paymentRecords : []
            };
        }
        
        return { loans: [], creditCards: [], paymentRecords: [] };
    }
    
    // 解析还款数据
    parseRepaymentData(excelData) {
        // 存储解析后的还款计划数据
        const repaymentData = {
            loans: [],
            creditCards: [],
            paymentRecords: []
        };

        const parseNumber = (value) => {
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            const text = String(value ?? '').trim();
            if (!text) return 0;
            const cleaned = text.replace(/[^\d.-]/g, '');
            const num = parseFloat(cleaned);
            return Number.isFinite(num) ? num : 0;
        };

        const parseDayOfMonth = (value) => {
            if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.min(31, Math.floor(value)));
            const text = String(value ?? '').trim();
            if (!text) return 1;
            const cleaned = text.replace(/[^\d]/g, '');
            const day = parseInt(cleaned, 10);
            return Number.isFinite(day) ? Math.max(1, Math.min(31, day)) : 1;
        };

        for (let i = 0; i < excelData.length; i++) {
            const row = excelData[i];
            
            // 查找借款平台信息（包含"借款"字段且值不为"待还"、"11月"等统计或月份数据）
            if (row.借款 && typeof row.借款 === 'string' && 
                !row.借款.includes('待还') && 
                !row.借款.includes('月') && 
                !row.借款.includes('拼多多') && 
                row.借款 !== '平台') {
                
                // 解析还款日期（通常在__EMPTY_1字段）
                const dueDate = parseDayOfMonth(row.__EMPTY_1 ?? row['还款日'] ?? row['还款日期'] ?? row.dueDate);
                
                // 解析总待还金额（通常在__EMPTY_2字段）
                const totalAmount = parseNumber(row.__EMPTY_2 ?? row['总待还'] ?? row['总金额'] ?? row.totalAmount);
                
                // 解析当前余额（通常在__EMPTY_5字段）
                const balance = parseNumber(row.__EMPTY_5 ?? row['剩余'] ?? row['剩余金额'] ?? row.balance);
                
                // 解析月还款额（通常在__EMPTY_6字段）
                const monthlyPayment = parseNumber(row.__EMPTY_6 ?? row['月还款'] ?? row['月还款额'] ?? row.monthlyPayment);
                
                // 创建贷款对象
                const loan = {
                    id: repaymentData.loans.length + 1,
                    name: row.借款,
                    type: 'personal',
                    totalAmount: totalAmount,
                    balance: balance,
                    monthlyPayment: monthlyPayment,
                    interestRate: 0, // Excel中没有利率信息
                    startDate: '2024-01-01', // 默认开始日期
                    endDate: '2025-01-01', // 默认结束日期
                    dueDate: dueDate
                };
                
                repaymentData.loans.push(loan);
            }
        }

        // 特殊处理京东借钱的多笔借款
        const jingdongLoanIndex = repaymentData.loans.findIndex(loan => loan.name === '京东借钱');
        if (jingdongLoanIndex !== -1) {
            // 从Excel数据中查找京东借钱的多笔借款信息
            const jingdongRows = excelData.filter(row => 
                row.__EMPTY && typeof row.__EMPTY === 'string' && 
                row.__EMPTY.includes('第') && row.__EMPTY.includes('笔')
            );
            
            // 获取京东借钱的还款日
            const jingdongDueDate = repaymentData.loans[jingdongLoanIndex].dueDate;
            
            jingdongRows.forEach((row, index) => {
                const totalAmount = parseNumber(row.__EMPTY_3 ?? row.__EMPTY_2 ?? row['总待还'] ?? row['总金额'] ?? row.totalAmount);
                const balance = parseNumber(row.__EMPTY_5 ?? row['剩余'] ?? row['剩余金额'] ?? row.balance);
                const monthlyPayment = parseNumber(row.__EMPTY_6 ?? row['月还款'] ?? row['月还款额'] ?? row.monthlyPayment);
                
                const loan = {
                    id: repaymentData.loans.length + 1,
                    name: `京东借钱-${row.__EMPTY}`,
                    type: 'personal',
                    totalAmount: totalAmount,
                    balance: balance,
                    monthlyPayment: monthlyPayment,
                    interestRate: 0,
                    startDate: '2024-01-01',
                    endDate: '2025-01-01',
                    dueDate: jingdongDueDate
                };
                
                repaymentData.loans.push(loan);
            });
            
            // 移除原始的京东借钱记录
            repaymentData.loans.splice(jingdongLoanIndex, 1);
        }

        return repaymentData;
    }
    
    // 保存还款数据
    saveRepaymentData() {
        try {
            localStorage.setItem('selfSystemRepaymentData', JSON.stringify(this.repaymentData));
        } catch (error) {
            console.error('保存还款数据失败:', error);
        }
    }
    
    // 获取默认还款数据
    getDefaultRepaymentData() {
        return {
            loans: [
                {
                    id: 1,
                    name: '住房贷款',
                    type: 'mortgage',
                    totalAmount: 1500000,
                    balance: 1200000,
                    monthlyPayment: 7500,
                    interestRate: 4.2,
                    startDate: '2020-06-10',
                    endDate: '2040-06-10',
                    dueDate: 15 // 每月还款日
                },
                {
                    id: 2,
                    name: '汽车贷款',
                    type: 'auto',
                    totalAmount: 120000,
                    balance: 50000,
                    monthlyPayment: 3500,
                    interestRate: 4.8,
                    startDate: '2023-01-15',
                    endDate: '2026-01-15',
                    dueDate: 20 // 每月还款日
                }
            ],
            creditCards: [
                {
                    id: 1,
                    name: '招商银行信用卡',
                    bank: '招商银行',
                    balance: 3000,
                    creditLimit: 50000,
                    dueDate: 15,
                    paymentDate: 25
                },
                {
                    id: 2,
                    name: '农业银行信用卡',
                    bank: '农业银行',
                    balance: 5000,
                    creditLimit: 30000,
                    dueDate: 10,
                    paymentDate: 20
                }
            ]
        };
    }
    
    // 更新还款概览指标
    updateRepaymentOverview() {
        // 计算总待还金额
        const totalRepayment = this.calculateTotalRepayment();
        document.getElementById('totalRepaymentAmount').textContent = `¥${totalRepayment.toLocaleString()}`;
        
        // 计算本月待还金额
        const monthlyRepayment = this.calculateMonthlyRepayment();
        document.getElementById('monthlyRepaymentAmount').textContent = `¥${monthlyRepayment.toLocaleString()}`;
        
        // 计算还款计划总数
        const repaymentCount = this.calculateRepaymentCount();
        document.getElementById('repaymentPlanCount').textContent = repaymentCount;
        
        // 计算还款进度
        const repaymentProgress = this.calculateRepaymentProgress();
        document.getElementById('repaymentProgress').textContent = `${repaymentProgress}%`;
    }
    
    // 计算总待还金额
    calculateTotalRepayment() {
        let total = 0;
        
        // 计算贷款总待还
        if (this.repaymentData.loans) {
            this.repaymentData.loans.forEach(loan => {
                total += loan.balance || 0;
            });
        }
        
        // 计算信用卡总待还
        if (this.repaymentData.creditCards) {
            this.repaymentData.creditCards.forEach(card => {
                total += card.balance || 0;
            });
        }
        
        return total;
    }
    
    // 计算本月待还金额
    calculateMonthlyRepayment() {
        let total = 0;
        
        // 计算贷款本月待还
        if (this.repaymentData.loans) {
            this.repaymentData.loans.forEach(loan => {
                total += loan.monthlyPayment || 0;
            });
        }
        
        // 计算信用卡本月待还
        if (this.repaymentData.creditCards) {
            this.repaymentData.creditCards.forEach(card => {
                total += card.balance || 0;
            });
        }
        
        return total;
    }
    
    // 计算还款计划总数
    calculateRepaymentCount() {
        let count = 0;
        if (this.repaymentData.loans) count += this.repaymentData.loans.length;
        if (this.repaymentData.creditCards) count += this.repaymentData.creditCards.length;
        return count;
    }
    
    // 计算还款进度
    calculateRepaymentProgress() {
        let totalProgress = 0;
        let planCount = 0;
        
        // 计算贷款进度
        if (this.repaymentData.loans) {
            this.repaymentData.loans.forEach(loan => {
                if (loan.totalAmount > 0) {
                    const progress = Math.round((1 - loan.balance / loan.totalAmount) * 100);
                    totalProgress += progress;
                    planCount++;
                }
            });
        }
        
        // 计算信用卡进度（信用卡按已还比例计算）
        if (this.repaymentData.creditCards) {
            this.repaymentData.creditCards.forEach(card => {
                if (card.creditLimit > 0) {
                    const progress = Math.round((1 - card.balance / card.creditLimit) * 100);
                    totalProgress += progress;
                    planCount++;
                }
            });
        }
        
        return planCount > 0 ? Math.round(totalProgress / planCount) : 0;
    }

    getPlanProgress(plan) {
        if (!plan) return 0;
        if (plan.category === 'loan') {
            const totalAmount = Number(plan.totalAmount) || 0;
            const balance = Number(plan.balance) || 0;
            if (totalAmount <= 0) return 0;
            return Math.round((1 - balance / totalAmount) * 100);
        }
        if (plan.category === 'credit_card') {
            const creditLimit = Number(plan.creditLimit) || 0;
            const balance = Number(plan.balance) || 0;
            if (creditLimit <= 0) return 0;
            return Math.round((1 - balance / creditLimit) * 100);
        }
        return 0;
    }
    
    // 渲染还款计划表格
    renderRepaymentPlans() {
        const repaymentTableBody = document.getElementById('repaymentTableBody');
        if (!repaymentTableBody) return;
        
        this.repaymentData = this.normalizeRepaymentData(this.repaymentData);
        
        // 合并贷款和信用卡数据
        const allPlans = [];
        
        // 添加贷款
        if (this.repaymentData.loans) {
            this.repaymentData.loans.forEach(loan => {
                allPlans.push({
                    ...loan,
                    category: 'loan'
                });
            });
        }
        
        // 添加信用卡
        if (this.repaymentData.creditCards) {
            this.repaymentData.creditCards.forEach(card => {
                allPlans.push({
                    ...card,
                    category: 'credit_card'
                });
            });
        }
        
        if (allPlans.length === 0) {
            repaymentTableBody.innerHTML = `
                <tr class="pwa-empty-row">
                    <td colspan="9">
                        <div class="pwa-empty-state">
                            <i class="fas fa-receipt"></i>
                            <p>还没有还款计划</p>
                            <p class="pwa-empty-hint">可以通过导入Excel文件添加还款计划</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        // 渲染还款计划表格
        this.allRepaymentPlans = allPlans; // 保存所有计划用于排序和筛选
        this.renderRepaymentTable();
        
        // 绑定表格控制事件
        this.bindTableControls();
        
        // 渲染还款图表
        this.renderRepaymentChart();
    }
    
    // 渲染还款计划表格
    renderRepaymentTable() {
        const repaymentTableBody = document.getElementById('repaymentTableBody');
        if (!repaymentTableBody) return;
        
        if (!this.allRepaymentPlans || this.allRepaymentPlans.length === 0) {
            const repaymentTableCount = document.getElementById('repaymentTableCount');
            if (repaymentTableCount) repaymentTableCount.textContent = `0 项`;
            repaymentTableBody.innerHTML = `
                <tr class="pwa-empty-row">
                    <td colspan="9">
                        <div class="pwa-empty-state">
                            <i class="fas fa-receipt"></i>
                            <p>还没有还款计划</p>
                            <p class="pwa-empty-hint">可以通过导入Excel文件添加还款计划</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        // 应用筛选和排序
        const filteredPlans = this.filterRepaymentPlans(this.allRepaymentPlans);
        const sortedPlans = this.sortRepaymentPlans(filteredPlans);
        
        repaymentTableBody.innerHTML = sortedPlans.map(plan => this.renderRepaymentPlanRow(plan)).join('');
        const repaymentTableCount = document.getElementById('repaymentTableCount');
        if (repaymentTableCount) repaymentTableCount.textContent = `${sortedPlans.length} 项`;
        repaymentTableBody.querySelectorAll('tr.repayment-plan-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target?.closest('button')) return;
                row.classList.toggle('selected');
            });
        });
    }
    
    // 筛选还款计划
    filterRepaymentPlans(plans) {
        const searchTerm = document.getElementById('repaymentSearch')?.value.toLowerCase() || '';
        
        if (!searchTerm) return plans;
        
        return plans.filter(plan => 
            plan.name.toLowerCase().includes(searchTerm)
        );
    }
    
    // 排序还款计划
    sortRepaymentPlans(plans) {
        const sortBy = document.getElementById('repaymentSort')?.value || 'platform';
        const order = document.getElementById('repaymentOrder')?.value || 'asc';
        
        return [...plans].sort((a, b) => {
            let aValue, bValue;
            
            switch (sortBy) {
                case 'platform':
                    aValue = a?.name ?? '';
                    bValue = b?.name ?? '';
                    break;
                case 'dueDate':
                    aValue = parseInt(a?.dueDate, 10) || 0;
                    bValue = parseInt(b?.dueDate, 10) || 0;
                    break;
                case 'totalAmount':
                    aValue = Number(a?.totalAmount ?? a?.creditLimit ?? 0) || 0;
                    bValue = Number(b?.totalAmount ?? b?.creditLimit ?? 0) || 0;
                    break;
                case 'monthlyPayment':
                    aValue = Number(a?.monthlyPayment ?? 0) || 0;
                    bValue = Number(b?.monthlyPayment ?? 0) || 0;
                    break;
                case 'balance':
                    aValue = Number(a?.balance ?? 0) || 0;
                    bValue = Number(b?.balance ?? 0) || 0;
                    break;
                case 'progress':
                    aValue = this.getPlanProgress(a);
                    bValue = this.getPlanProgress(b);
                    break;
                default:
                    aValue = a?.name ?? '';
                    bValue = b?.name ?? '';
            }
            
            // 处理字符串比较
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = String(bValue ?? '').toLowerCase();
            }
            
            if (aValue < bValue) return order === 'asc' ? -1 : 1;
            if (aValue > bValue) return order === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    // 绑定表格控制事件
    bindTableControls() {
        const searchInput = document.getElementById('repaymentSearch');
        const sortSelect = document.getElementById('repaymentSort');
        const orderSelect = document.getElementById('repaymentOrder');
        
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.renderRepaymentTable();
            });
        }
        
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                this.renderRepaymentTable();
            });
        }
        
        if (orderSelect) {
            orderSelect.addEventListener('change', () => {
                this.renderRepaymentTable();
            });
        }
        
        // 绑定表头点击排序
        const tableHeaders = document.querySelectorAll('#repaymentPlansModule .pwa-table th[data-sort]');
        tableHeaders.forEach(header => {
            header.style.cursor = 'pointer';
            header.addEventListener('click', () => {
                const sortField = header.getAttribute('data-sort');
                const sortSelect = document.getElementById('repaymentSort');
                const orderSelect = document.getElementById('repaymentOrder');
                
                if (sortSelect && orderSelect) {
                    // 如果已经是当前排序字段，切换排序方向
                    if (sortSelect.value === sortField) {
                        orderSelect.value = orderSelect.value === 'asc' ? 'desc' : 'asc';
                    } else {
                        sortSelect.value = sortField;
                        orderSelect.value = 'asc';
                    }
                    this.renderRepaymentTable();
                }
            });
        });
    }
    
    // 渲染单个还款计划项
    renderRepaymentPlanItem(plan) {
        if (plan.category === 'loan') {
            return `
                <div class="repayment-plan-item loan">
                    <div class="plan-header">
                        <div class="plan-info">
                            <h4>${plan.name}</h4>
                            <p class="plan-type">${this.getLoanTypeLabel(plan.type)}</p>
                        </div>
                        <div class="plan-amount">
                            <span class="balance">¥${plan.balance.toLocaleString()}</span>
                            <span class="total">总: ¥${plan.totalAmount.toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="plan-details">
                        <div class="detail-item">
                            <i class="fas fa-calendar-alt"></i>
                            <span>还款日: 每月${plan.dueDate}日</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-money-bill-wave"></i>
                            <span>月还款额: ¥${plan.monthlyPayment.toLocaleString()}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-percentage"></i>
                            <span>利率: ${plan.interestRate}%</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-clock"></i>
                            <span>剩余期限: ${this.calculateRemainingMonths(plan.endDate)}个月</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (plan.category === 'credit_card') {
            return `
                <div class="repayment-plan-item credit-card">
                    <div class="plan-header">
                        <div class="plan-info">
                            <h4>${plan.name}</h4>
                            <p class="plan-type">信用卡</p>
                        </div>
                        <div class="plan-amount">
                            <span class="balance">¥${plan.balance.toLocaleString()}</span>
                            <span class="limit">额度: ¥${plan.creditLimit.toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="plan-details">
                        <div class="detail-item">
                            <i class="fas fa-calendar-alt"></i>
                            <span>账单日: 每月${plan.dueDate}日</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-calendar-check"></i>
                            <span>还款日: 每月${plan.paymentDate}日</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-chart-pie"></i>
                            <span>使用率: ${Math.round((plan.balance / plan.creditLimit) * 100)}%</span>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    // 获取贷款类型标签
    getLoanTypeLabel(type) {
        const labels = {
            'mortgage': '住房贷款',
            'auto': '汽车贷款',
            'personal': '个人贷款',
            'education': '教育贷款'
        };
        return labels[type] || type;
    }
    
    // 计算剩余月数
    calculateRemainingMonths(endDate) {
        const end = new Date(endDate);
        const now = new Date();
        const diff = end - now;
        const months = Math.ceil(diff / (1000 * 60 * 60 * 24 * 30));
        return Math.max(0, months);
    }
    
    // 渲染还款计划表格行
    renderRepaymentPlanRow(plan) {
        const formatMoney = (value) => `¥${(Number(value) || 0).toLocaleString()}`;

        // 计算还款进度
        let progress = 0;
        let installmentCount = 0;
        let totalInstallments = 0;
        
        // 获取进度条CSS类名
        const getProgressClass = (progress) => {
            if (progress >= 90) return 'excellent';
            if (progress >= 70) return 'good';
            if (progress >= 30) return 'warning';
            return 'danger';
        };
        
        if (plan.category === 'loan') {
            // 计算贷款还款进度
            progress = this.getPlanProgress(plan);
            
            // 估算已还期数和总期数
            const monthlyPayment = Number(plan.monthlyPayment) || 0;
            const totalAmount = Number(plan.totalAmount) || 0;
            const balance = Number(plan.balance) || 0;
            if (monthlyPayment > 0) {
                totalInstallments = Math.ceil(totalAmount / monthlyPayment);
                installmentCount = Math.ceil((totalAmount - balance) / monthlyPayment);
            }
            
            const progressClass = getProgressClass(progress);
            
            return `
                <tr class="repayment-plan-row loan" data-plan-id="${plan.id}" data-plan-category="${plan.category}">
                    <td>${plan.name}</td>
                    <td>${plan.dueDate}日</td>
                    <td>${formatMoney(plan.totalAmount)}</td>
                    <td>${formatMoney(plan.monthlyPayment)}</td>
                    <td>${formatMoney(plan.balance)}</td>
                    <td>${installmentCount}</td>
                    <td>${totalInstallments}</td>
                    <td>
                        <div class="progress-container">
                            <div class="progress-bar">
                                <div class="progress-fill ${progressClass}" style="width: ${progress}%"></div>
                            </div>
                            <span class="progress-text">${progress}%</span>
                        </div>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-small btn-primary" onclick="selfSystem.recordPayment(${plan.id}, '${plan.category}')" title="记录还款">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn btn-small btn-secondary" onclick="selfSystem.calculatePrepayment(${plan.id}, '${plan.category}')" title="提前还款">
                                <i class="fas fa-fast-forward"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        } else if (plan.category === 'credit_card') {
            // 计算信用卡还款进度（已还比例）
            progress = this.getPlanProgress(plan);
            
            const progressClass = getProgressClass(progress);
            
            return `
                <tr class="repayment-plan-row credit-card" data-plan-id="${plan.id}" data-plan-category="${plan.category}">
                    <td>${plan.name}</td>
                    <td>${plan.dueDate}日</td>
                    <td>${formatMoney(plan.creditLimit)}</td>
                    <td>${formatMoney(plan.balance)}</td>
                    <td>${formatMoney(plan.balance)}</td>
                    <td>-</td>
                    <td>-</td>
                    <td>
                        <div class="progress-container">
                            <div class="progress-bar">
                                <div class="progress-fill ${progressClass}" style="width: ${progress}%"></div>
                            </div>
                            <span class="progress-text">${progress}%</span>
                        </div>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-small btn-primary" onclick="selfSystem.recordPayment(${plan.id}, '${plan.category}')" title="记录还款">
                                <i class="fas fa-check"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }
    }
    
    // 记录还款
    recordPayment(planId, category) {
        // 显示还款记录对话框
        const amount = prompt('请输入还款金额：');
        
        if (amount === null) return; // 用户取消操作
        
        const paymentAmount = parseFloat(amount);
        
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            alert('请输入有效的还款金额！');
            return;
        }
        
        // 查找对应的还款计划
        let plan = null;
        let plansArray = null;
        
        if (category === 'loan') {
            plansArray = this.repaymentData.loans;
        } else if (category === 'credit_card') {
            plansArray = this.repaymentData.creditCards;
        }
        
        if (plansArray) {
            plan = plansArray.find(p => p.id === planId);
        }
        
        if (!plan) {
            alert('未找到对应的还款计划！');
            return;
        }
        
        // 更新余额
        if (paymentAmount > plan.balance) {
            alert('还款金额不能超过剩余余额！');
            return;
        }
        
        plan.balance -= paymentAmount;
        
        // 保存数据
        this.saveRepaymentData();
        
        // 更新UI
        this.updateRepaymentOverview();
        this.renderRepaymentPlans();
        this.renderUpcomingPayments();
        this.syncRepaymentToTodoCalendar();
        
        // 记录还款记录
        this.addPaymentRecord(planId, category, paymentAmount);
        
        alert('还款记录成功！');
    }
    
    // 提前还款计算
    calculatePrepayment(planId, category) {
        // 显示提前还款计算对话框
        const prepaymentAmount = prompt('请输入提前还款金额：');
        
        if (prepaymentAmount === null) return; // 用户取消操作
        
        const amount = parseFloat(prepaymentAmount);
        
        if (isNaN(amount) || amount <= 0) {
            alert('请输入有效的提前还款金额！');
            return;
        }
        
        // 查找对应的贷款
        const loan = this.repaymentData.loans.find(l => l.id === planId);
        
        if (!loan || category !== 'loan') {
            alert('未找到对应的贷款计划！');
            return;
        }
        
        if (amount > loan.balance) {
            alert('提前还款金额不能超过剩余余额！');
            return;
        }
        
        // 计算提前还款后的新余额
        const newBalance = loan.balance - amount;
        
        // 计算剩余期数（简化计算）
        const remainingInstallments = Math.ceil(newBalance / loan.monthlyPayment);
        
        // 计算节省的利息（简化计算）
        const originalRemainingInstallments = Math.ceil(loan.balance / loan.monthlyPayment);
        const savedInstallments = originalRemainingInstallments - remainingInstallments;
        const savedInterest = savedInstallments * loan.monthlyPayment - amount;
        
        // 显示计算结果
        const confirmPrepayment = confirm(
            `提前还款计算结果：\n` +
            `提前还款金额：¥${amount.toLocaleString()}\n` +
            `提前还款后余额：¥${newBalance.toLocaleString()}\n` +
            `剩余还款期数：${remainingInstallments}期\n` +
            `预计节省利息：¥${savedInterest.toLocaleString()}\n\n` +
            `是否确认提前还款？`
        );
        
        if (confirmPrepayment) {
            // 执行提前还款
            loan.balance = newBalance;
            
            // 保存数据
            this.saveRepaymentData();
            
            // 更新UI
            this.updateRepaymentOverview();
            this.renderRepaymentPlans();
            this.renderUpcomingPayments();
            this.syncRepaymentToTodoCalendar();
            
            // 记录还款记录
            this.addPaymentRecord(planId, category, amount, true);
            
            alert('提前还款成功！');
        }
    }
    
    // 添加还款记录
    addPaymentRecord(planId, category, amount, isPrepayment = false) {
        // 初始化还款记录数组
        if (!this.repaymentData.paymentRecords) {
            this.repaymentData.paymentRecords = [];
        }
        
        // 查找对应的还款计划
        let planName = '';
        
        if (category === 'loan') {
            const plan = this.repaymentData.loans.find(p => p.id === planId);
            if (plan) planName = plan.name;
        } else if (category === 'credit_card') {
            const plan = this.repaymentData.creditCards.find(p => p.id === planId);
            if (plan) planName = plan.name;
        }
        
        // 创建还款记录
        const record = {
            id: this.repaymentData.paymentRecords.length + 1,
            planId: planId,
            category: category,
            planName: planName,
            amount: amount,
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString('zh-CN'),
            isPrepayment: isPrepayment
        };
        
        // 添加到还款记录数组
        this.repaymentData.paymentRecords.unshift(record);
        
        // 保存数据
        this.saveRepaymentData();
        
        // 渲染还款记录
        this.renderPaymentRecords();
    }
    
    // 渲染还款记录
    renderPaymentRecords() {
        const repaymentRecordsContainer = document.getElementById('repaymentRecords');
        
        // 如果没有还款记录，显示空状态
        if (!this.repaymentData.paymentRecords || this.repaymentData.paymentRecords.length === 0) {
            const repaymentRecordsCount = document.getElementById('repaymentRecordsCount');
            if (repaymentRecordsCount) repaymentRecordsCount.textContent = `0 项`;
            repaymentRecordsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>还没有还款记录</p>
                    <p class="empty-hint">记录您的还款情况，跟踪财务状况</p>
                </div>
            `;
            return;
        }
        
        const repaymentRecordsCount = document.getElementById('repaymentRecordsCount');
        if (repaymentRecordsCount) repaymentRecordsCount.textContent = `${this.repaymentData.paymentRecords.length} 项`;

        // 渲染还款记录表格（Excel样式）
        repaymentRecordsContainer.innerHTML = `
            <table class="payment-records-table">
                <thead>
                    <tr>
                        <th>日期</th>
                        <th>时间</th>
                        <th>平台</th>
                        <th>还款类型</th>
                        <th>金额</th>
                        <th>备注</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.repaymentData.paymentRecords.map(record => `
                        <tr class="payment-record-row">
                            <td>${record.date}</td>
                            <td>${record.time}</td>
                            <td>${record.planName}</td>
                            <td>${record.category === 'loan' ? '贷款还款' : '信用卡还款'}</td>
                            <td class="amount-column">¥${record.amount.toLocaleString()}</td>
                            <td>${record.isPrepayment ? '提前还款' : ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    scrollToRepaymentPlan(planId, category) {
        const tableBody = document.getElementById('repaymentTableBody');
        if (!tableBody) return;
        const safeCategory = category === 'loan' ? 'loan' : category === 'credit_card' ? 'credit_card' : '';
        const row = tableBody.querySelector(`tr.repayment-plan-row[data-plan-id="${planId}"][data-plan-category="${safeCategory}"]`);
        if (!row) return;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('selected');
    }
    
    // 渲染近期还款提醒
    renderUpcomingPayments() {
        const upcomingPayments = document.getElementById('upcomingPayments');
        
        // 获取近期还款项目（未来30天内）
        const upcoming = this.getUpcomingPayments(30);
        const upcomingPaymentsCount = document.getElementById('upcomingPaymentsCount');
        if (upcomingPaymentsCount) upcomingPaymentsCount.textContent = `${upcoming.length} 项`;
        
        if (upcoming.length === 0) {
            upcomingPayments.innerHTML = `
                <div class="pwa-empty-payments">
                    <i class="fas fa-check-circle"></i>
                    <p>暂无近期还款提醒</p>
                    <p class="pwa-empty-hint">所有还款计划都已按时完成</p>
                </div>
            `;
            return;
        }
        
        // 按日期排序
        upcoming.sort((a, b) => a.date - b.date);
        
        upcomingPayments.innerHTML = upcoming.map(payment => {
            // 计算还款优先级
            const daysUntilDue = Math.ceil((payment.date - new Date()) / (1000 * 60 * 60 * 24));
            let priorityClass = 'normal';
            if (payment.isOverdue) priorityClass = 'urgent';
            else if (daysUntilDue <= 7) priorityClass = 'urgent';
            else if (daysUntilDue <= 15) priorityClass = 'warning';
            
            return `
                <div class="pwa-payment-card ${priorityClass}">
                    <div class="pwa-payment-header">
                        <div class="pwa-payment-platform">${payment.name}</div>
                        <div class="pwa-payment-due-date ${priorityClass}">
                            <i class="fas fa-calendar-day"></i>
                            ${this.formatMonthDay(payment.date)}
                            ${payment.isOverdue ? '<i class="fas fa-exclamation-triangle"></i>' : ''}
                        </div>
                    </div>
                    
                    <div class="pwa-payment-details">
                        <div class="pwa-payment-amount">¥${payment.amount.toLocaleString()}</div>
                        <div class="pwa-payment-progress">
                            <div class="pwa-progress-bar">
                                <div class="pwa-progress-fill" style="width: ${payment.isOverdue ? '100' : Math.max(0, Math.min(100, 100 - (daysUntilDue / 30) * 100))}%"></div>
                            </div>
                            <div class="pwa-progress-text">${payment.isOverdue ? '已逾期' : `${daysUntilDue}天后`}</div>
                        </div>
                    </div>
                    
                    <div class="pwa-payment-actions">
                        <button class="pwa-action-btn primary" onclick="selfSystem.recordPayment(${payment.id}, '${payment.type === 'loan' ? 'loan' : 'credit_card'}')">
                            <i class="fas fa-check"></i> 记录还款
                        </button>
                        <button class="pwa-action-btn secondary" onclick="selfSystem.scrollToRepaymentPlan(${payment.id}, '${payment.type === 'loan' ? 'loan' : 'credit_card'}')">
                            <i class="fas fa-eye"></i> 查看详情
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // 获取近期还款项目
    getUpcomingPayments(days = 30) {
        const upcoming = [];
        const now = new Date();
        const futureDate = new Date();
        futureDate.setDate(now.getDate() + days);
        
        // 处理贷款
        if (this.repaymentData.loans) {
            this.repaymentData.loans.forEach(loan => {
                // 计算下一个还款日
                const nextPaymentDate = this.getNextPaymentDate(loan.dueDate);
                
                if (nextPaymentDate <= futureDate) {
                    upcoming.push({
                        id: loan.id,
                        name: loan.name,
                        description: '贷款还款',
                        amount: loan.monthlyPayment,
                        date: nextPaymentDate,
                        isOverdue: nextPaymentDate < now,
                        type: 'loan'
                    });
                }
            });
        }
        
        // 处理信用卡
        if (this.repaymentData.creditCards) {
            this.repaymentData.creditCards.forEach(card => {
                // 计算下一个还款日
                const nextPaymentDate = this.getNextPaymentDate(card.paymentDate);
                
                if (nextPaymentDate <= futureDate) {
                    upcoming.push({
                        id: card.id,
                        name: card.name,
                        description: '信用卡还款',
                        amount: card.balance,
                        date: nextPaymentDate,
                        isOverdue: nextPaymentDate < now,
                        type: 'credit_card'
                    });
                }
            });
        }
        
        return upcoming;
    }
    
    // 获取下一个还款日期
    getNextPaymentDate(dueDate) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        
        let nextDate = new Date(year, month, dueDate);
        
        // 如果本月还款日已过，计算下个月的
        if (nextDate < now) {
            nextDate = new Date(year, month + 1, dueDate);
        }
        
        return nextDate;
    }

    getRepaymentDateForMonth(year, monthIndex, dayOfMonth) {
        const safeDay = Math.max(1, Math.min(31, Math.floor(Number(dayOfMonth) || 1)));
        const lastDay = new Date(year, monthIndex + 1, 0).getDate();
        return new Date(year, monthIndex, Math.min(safeDay, lastDay));
    }

    clearTodoCalendarRepaymentSchedules(todoSchedules) {
        const schedules = todoSchedules && typeof todoSchedules === 'object' ? todoSchedules : {};
        let changed = false;
        Object.keys(schedules).forEach(dateKey => {
            const before = Array.isArray(schedules[dateKey]) ? schedules[dateKey] : [];
            const after = before.filter(item => {
                const id = String(item?.id || '');
                return !(id.startsWith('repayment-') || item?.repaymentPlanId);
            });
            if (after.length !== before.length) {
                changed = true;
                if (after.length === 0) delete schedules[dateKey];
                else schedules[dateKey] = after;
            }
        });
        return changed;
    }

    syncRepaymentToTodoCalendar(months = 6) {
        const todoSchedules = this.loadTodoCalendarSchedules();
        this.clearTodoCalendarRepaymentSchedules(todoSchedules);

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const pad2 = (n) => String(n).padStart(2, '0');
        const formatMoney = (value) => `¥${(Number(value) || 0).toLocaleString()}`;

        const addTodoItem = (date, todoItem) => {
            const dateKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toDateString();
            if (!Array.isArray(todoSchedules[dateKey])) todoSchedules[dateKey] = [];
            const idx = todoSchedules[dateKey].findIndex(s => String(s?.id || '') === String(todoItem.id));
            if (idx >= 0) todoSchedules[dateKey][idx] = todoItem;
            else todoSchedules[dateKey].push(todoItem);
        };

        for (let i = 0; i < Math.max(1, Number(months) || 6); i++) {
            const cursor = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const year = cursor.getFullYear();
            const monthIndex = cursor.getMonth();
            const monthKey = `${year}-${pad2(monthIndex + 1)}`;

            const loans = Array.isArray(this.repaymentData?.loans) ? this.repaymentData.loans : [];
            loans.forEach(loan => {
                const balance = Number(loan?.balance) || 0;
                const monthlyPayment = Number(loan?.monthlyPayment) || 0;
                if (balance <= 0 || monthlyPayment <= 0) return;
                const due = this.getRepaymentDateForMonth(year, monthIndex, loan?.dueDate);
                if (due < today) return;

                const daysUntilDue = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
                const priority = daysUntilDue <= 7 ? 'high' : daysUntilDue <= 15 ? 'medium' : 'low';
                const amount = Math.max(0, Math.min(monthlyPayment, balance) || monthlyPayment);
                const id = `repayment-loan-${loan.id}-${monthKey}`;

                addTodoItem(due, {
                    id,
                    time: '09:00',
                    content: `[还款] ${loan.name}（贷款） - ${formatMoney(amount)}`,
                    priority,
                    repaymentPlanId: loan.id,
                    repaymentCategory: 'loan',
                    repaymentMonthKey: monthKey
                });
            });

            const cards = Array.isArray(this.repaymentData?.creditCards) ? this.repaymentData.creditCards : [];
            cards.forEach(card => {
                const balance = Number(card?.balance) || 0;
                if (balance <= 0) return;
                const due = this.getRepaymentDateForMonth(year, monthIndex, card?.paymentDate ?? card?.dueDate);
                if (due < today) return;

                const daysUntilDue = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
                const priority = daysUntilDue <= 7 ? 'high' : daysUntilDue <= 15 ? 'medium' : 'low';
                const id = `repayment-credit_card-${card.id}-${monthKey}`;

                addTodoItem(due, {
                    id,
                    time: '09:00',
                    content: `[还款] ${card.name}（信用卡） - ${formatMoney(balance)}`,
                    priority,
                    repaymentPlanId: card.id,
                    repaymentCategory: 'credit_card',
                    repaymentMonthKey: monthKey
                });
            });
        }

        this.saveTodoCalendarSchedules(todoSchedules);
    }
    
    formatMonthDay(date) {
        const d = new Date(date);
        return `${d.getMonth() + 1}月${d.getDate()}日`;
    }

    // 显示资产模块
    showAssetsModule() {
        // 初始化资产数据
        this.updateAssetsModule();
    }

    // 更新资产模块数据
    updateAssetsModule() {
        // 计算总资产
        const totalAssets = this.calculateTotalAssets();
        document.getElementById('assetsTotalAmount').textContent = `¥${totalAssets.toLocaleString()}`;
        
        // 渲染资产列表
        this.renderAssetsList();
    }

    // 渲染资产列表
    renderAssetsList() {
        const assetsList = document.getElementById('assetsList');
        
        if (!this.financeData.bankAccounts || this.financeData.bankAccounts.length === 0) {
            assetsList.innerHTML = `
                <div class="pwa-empty-state">
                    <i class="fas fa-wallet"></i>
                    <h3>还没有资产记录</h3>
                    <p>点击"添加资产"按钮开始管理您的资产</p>
                </div>
            `;
            return;
        }

        assetsList.innerHTML = this.financeData.bankAccounts.map(account => `
            <div class="pwa-asset-card">
                <div class="pwa-asset-header">
                    <div class="pwa-asset-info">
                        <h4>${account.name}</h4>
                        <p class="pwa-asset-bank">${account.bank}</p>
                    </div>
                    <div class="pwa-asset-amount">
                        <span class="pwa-amount">¥${account.balance.toLocaleString()}</span>
                    </div>
                </div>
                <div class="pwa-asset-details">
                    <div class="pwa-detail-item">
                        <i class="fas fa-credit-card"></i>
                        <span>卡号: ${account.accountNumber}</span>
                    </div>
                </div>
                <div class="pwa-asset-actions">
                    <button class="pwa-btn small primary" onclick="selfSystem.editAsset(${account.id})">
                        <i class="fas fa-edit"></i> 编辑
                    </button>
                    <button class="pwa-btn small secondary" onclick="selfSystem.viewAssetHistory(${account.id})">
                        <i class="fas fa-history"></i> 历史
                    </button>
                </div>
            </div>
        `).join('');
    }

    // 显示储蓄模块
    showSavingsModule() {
        // 初始化储蓄数据
        this.updateSavingsModule();
    }

    // 更新储蓄模块数据
    updateSavingsModule() {
        // 计算总储蓄
        const totalSavings = this.calculateTotalSavings();
        document.getElementById('savingsTotalAmount').textContent = `¥${totalSavings.toLocaleString()}`;
        
        // 渲染储蓄列表
        this.renderSavingsList();
    }

    // 渲染储蓄列表
    renderSavingsList() {
        const savingsList = document.getElementById('savingsList');
        
        if (!this.financeData.savingsAccounts || this.financeData.savingsAccounts.length === 0) {
            savingsList.innerHTML = `
                <div class="pwa-empty-state">
                    <i class="fas fa-piggy-bank"></i>
                    <h3>还没有储蓄记录</h3>
                    <p>点击"添加储蓄"按钮开始管理您的储蓄计划</p>
                </div>
            `;
            return;
        }

        savingsList.innerHTML = this.financeData.savingsAccounts.map(account => {
            // 确保所有必需的属性都存在，提供默认值
            const name = account.name || '未命名账户';
            const bank = account.bank || '未知银行';
            const balance = account.balance || 0;
            const interestRate = account.interestRate || 0;
            const term = account.term || 0;
            const expectedInterest = account.expectedInterest || 0;
            const id = account.id || 0;
            
            return `
                <div class="pwa-savings-card">
                    <div class="pwa-savings-header">
                        <div class="pwa-savings-info">
                            <h4>${name}</h4>
                            <p class="pwa-savings-bank">${bank}</p>
                        </div>
                        <div class="pwa-savings-amount">
                            <span class="pwa-amount">¥${balance.toLocaleString()}</span>
                            <span class="pwa-interest-rate">${interestRate}%</span>
                        </div>
                    </div>
                    <div class="pwa-savings-details">
                        <div class="pwa-detail-item">
                            <i class="fas fa-calendar-alt"></i>
                            <span>期限: ${term}个月</span>
                        </div>
                        <div class="pwa-detail-item">
                            <i class="fas fa-money-bill-wave"></i>
                            <span>预计收益: ¥${expectedInterest.toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="pwa-savings-actions">
                        <button class="pwa-btn small primary" onclick="selfSystem.editSavings(${id})">
                            <i class="fas fa-edit"></i> 编辑
                        </button>
                        <button class="pwa-btn small secondary" onclick="selfSystem.viewSavingsHistory(${id})">
                            <i class="fas fa-chart-line"></i> 收益
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 显示投资模块
    showInvestmentsModule() {
        // 初始化投资数据
        this.updateInvestmentsModule();
    }

    // 更新投资模块数据
    updateInvestmentsModule() {
        // 计算总投资
        const totalInvestments = this.calculateTotalInvestments();
        document.getElementById('investmentsTotalAmount').textContent = `¥${totalInvestments.toLocaleString()}`;
        
        // 渲染投资列表
        this.renderInvestmentsList();
    }

    // 渲染投资列表
    renderInvestmentsList() {
        const investmentsList = document.getElementById('investmentsList');
        
        if (!this.financeData.investments || this.financeData.investments.length === 0) {
            investmentsList.innerHTML = `
                <div class="pwa-empty-state">
                    <i class="fas fa-chart-pie"></i>
                    <h3>还没有投资记录</h3>
                    <p>点击"添加投资"按钮开始管理您的投资组合</p>
                </div>
            `;
            return;
        }

        investmentsList.innerHTML = this.financeData.investments.map(investment => {
            const id = Number(investment?.id ?? 0) || 0;
            const name = String(investment?.name ?? '未命名');
            const type = String(investment?.type ?? '-');
            const principal = Number(investment?.principal ?? investment?.purchasePrice ?? 0) || 0;
            const currentValue = Number(investment?.currentValue ?? 0) || 0;
            const profit = Number(investment?.profit ?? (currentValue - principal)) || 0;
            const returnRate = Number(investment?.returnRate ?? (principal > 0 ? (profit / principal) * 100 : 0)) || 0;
            const formattedReturnRate = `${returnRate >= 0 ? '+' : ''}${returnRate.toFixed(2)}%`;
            const returnRateClass = returnRate >= 0 ? 'positive' : 'negative';

            return `
                <div class="pwa-investment-card">
                    <div class="pwa-investment-header">
                        <div class="pwa-investment-info">
                            <h4>${name}</h4>
                            <p class="pwa-investment-type">${type}</p>
                        </div>
                        <div class="pwa-investment-amount">
                            <span class="pwa-amount">¥${currentValue.toLocaleString()}</span>
                            <span class="pwa-return-rate ${returnRateClass}">
                                ${formattedReturnRate}
                            </span>
                        </div>
                    </div>
                    <div class="pwa-investment-details">
                        <div class="pwa-detail-item">
                            <i class="fas fa-money-bill"></i>
                            <span>投入: ¥${principal.toLocaleString()}</span>
                        </div>
                        <div class="pwa-detail-item">
                            <i class="fas fa-chart-line"></i>
                            <span>收益: ¥${profit.toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="pwa-investment-actions">
                        <button class="pwa-btn small primary" onclick="selfSystem.editInvestment(${id})">
                            <i class="fas fa-edit"></i> 编辑
                        </button>
                        <button class="pwa-btn small secondary" onclick="selfSystem.viewInvestmentChart(${id})">
                            <i class="fas fa-chart-bar"></i> 图表
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 加载财务数据
    loadFinanceData() {
        try {
            const saved = localStorage.getItem('selfSystemFinanceData');
            return saved ? JSON.parse(saved) : this.getDefaultFinanceData();
        } catch (error) {
            console.error('加载财务数据失败:', error);
            return this.getDefaultFinanceData();
        }
    }

    // 保存财务数据
    saveFinanceData() {
        try {
            localStorage.setItem('selfSystemFinanceData', JSON.stringify(this.financeData));
        } catch (error) {
            console.error('保存财务数据失败:', error);
        }
    }

    // 导入还款数据
    importRepaymentData(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                // 验证数据格式
                if (!data.loans && !data.creditCards) {
                    throw new Error('无效的还款数据格式');
                }
                
                // 更新数据
                this.repaymentData = data;
                this.saveRepaymentData();
                
                // 刷新UI
                this.updateRepaymentOverview();
                this.renderRepaymentPlans();
                this.renderUpcomingPayments();
                
                alert('还款数据导入成功！');
            } catch (error) {
                console.error('导入失败:', error);
                alert('导入失败: ' + error.message);
            }
            
            // 清空文件输入，以便下次可以选择同一文件
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    // 渲染还款图表
    renderRepaymentChart() {
        const ctx = document.getElementById('repaymentChart');
        if (!ctx) return;
        
        // 销毁旧图表
        if (this.repaymentChartInstance) {
            this.repaymentChartInstance.destroy();
        }
        
        // 准备数据
        const labels = [];
        const data = [];
        const backgroundColors = [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
        ];
        
        // 收集贷款数据
        if (this.repaymentData.loans) {
            this.repaymentData.loans.forEach(loan => {
                if (loan.balance > 0) {
                    labels.push(loan.name);
                    data.push(loan.balance);
                }
            });
        }
        
        // 收集信用卡数据
        if (this.repaymentData.creditCards) {
            this.repaymentData.creditCards.forEach(card => {
                if (card.balance > 0) {
                    labels.push(card.name);
                    data.push(card.balance);
                }
            });
        }
        
        // 如果没有数据，显示空图表或隐藏
        if (data.length === 0) {
            // 可以选择隐藏图表容器
            return;
        }
        
        // 创建新图表
        try {
            if (typeof Chart !== 'undefined') {
                this.repaymentChartInstance = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: data,
                            backgroundColor: backgroundColors.slice(0, data.length),
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    color: '#ffffff' // 适配深色主题
                                }
                            },
                            title: {
                                display: true,
                                text: '债务分布',
                                color: '#ffffff'
                            }
                        }
                    }
                });
            } else {
                console.warn('Chart.js not loaded, falling back to simple chart');
                this.renderSimpleChart(ctx, labels, data);
            }
        } catch (e) {
            console.error('Chart.js creation failed:', e);
            this.renderSimpleChart(ctx, labels, data);
        }
    }

    // 简单的Canvas图表绘制（作为Chart.js的备选）
    renderSimpleChart(canvas, labels, data) {
        const ctx = canvas.getContext('2d');
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Set canvas size if not set (important for high DPI)
        // canvas.width = canvas.offsetWidth;
        // canvas.height = canvas.offsetHeight;

        const total = data.reduce((a, b) => a + b, 0);
        let startAngle = 0;
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) * 0.8;
        
        data.forEach((value, index) => {
            const sliceAngle = (value / total) * 2 * Math.PI;
            
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            
            ctx.fillStyle = colors[index % colors.length];
            ctx.fill();
            
            startAngle += sliceAngle;
        });
        
        // Draw center hole for doughnut
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#2c3e50'; // Match background
        ctx.fill();
        
        // Draw text
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('债务分布', centerX, centerY);
    }

    loadTimetableState() {
        const empty = {
            version: 1,
            activeSemesterId: '',
            editingSchemeId: '',
            semesters: [],
            schemes: [],
            courses: []
        };
        try {
            const raw = localStorage.getItem('selfSystemTimetable');
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || typeof parsed !== 'object') return empty;
            return {
                version: 1,
                activeSemesterId: typeof parsed.activeSemesterId === 'string' ? parsed.activeSemesterId : '',
                editingSchemeId: typeof parsed.editingSchemeId === 'string' ? parsed.editingSchemeId : '',
                semesters: Array.isArray(parsed.semesters) ? parsed.semesters.filter(Boolean) : [],
                schemes: Array.isArray(parsed.schemes) ? parsed.schemes.filter(Boolean) : [],
                courses: Array.isArray(parsed.courses) ? parsed.courses.filter(Boolean) : []
            };
        } catch (error) {
            console.error('加载课程表数据失败:', error);
            return empty;
        }
    }

    saveTimetableState() {
        try {
            localStorage.setItem('selfSystemTimetable', JSON.stringify(this.timetableState || {}));
        } catch (error) {
            console.error('保存课程表数据失败:', error);
        }
    }

    createTimetableId(prefix) {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    getTimetableActiveSemester() {
        const semesters = Array.isArray(this.timetableState?.semesters) ? this.timetableState.semesters : [];
        const activeId = this.timetableState?.activeSemesterId || '';
        const active = semesters.find(s => s?.id === activeId);
        return active || semesters[0] || null;
    }

    getTimetableSemesterById(id) {
        const semesters = Array.isArray(this.timetableState?.semesters) ? this.timetableState.semesters : [];
        return semesters.find(s => s?.id === id) || null;
    }

    getTimetableSchemeById(id) {
        const schemes = Array.isArray(this.timetableState?.schemes) ? this.timetableState.schemes : [];
        return schemes.find(s => s?.id === id) || null;
    }

    getTimetableActiveSchemeForSemester(semester) {
        const schemes = Array.isArray(this.timetableState?.schemes) ? this.timetableState.schemes : [];
        if (!semester) return schemes[0] || null;
        const preferred = semester?.schemeId ? schemes.find(s => s?.id === semester.schemeId) : null;
        return preferred || schemes[0] || null;
    }

    getStartOfWeek(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = (day + 6) % 7;
        d.setDate(d.getDate() - diff);
        return d;
    }

    addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    }

    getIsoWeek(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const dayNum = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - dayNum + 3);
        const firstThursday = new Date(d.getFullYear(), 0, 4);
        firstThursday.setHours(0, 0, 0, 0);
        const firstDayNum = (firstThursday.getDay() + 6) % 7;
        firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
        const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
        return { year: d.getFullYear(), week };
    }

    getTeachingWeekForDate(date, semester) {
        const start = semester?.startDate ? new Date(`${semester.startDate}T00:00:00`) : null;
        const end = semester?.endDate ? new Date(`${semester.endDate}T00:00:00`) : null;
        if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
        const current = new Date(date);
        current.setHours(0, 0, 0, 0);
        if (current < start || current > end) return null;
        const diffDays = Math.floor((current - start) / (24 * 60 * 60 * 1000));
        return Math.floor(diffDays / 7) + 1;
    }

    initTimetableIfNeeded() {
        if (this.timetableInitialized) return;
        if (!this.timetableState || typeof this.timetableState !== 'object') {
            this.timetableState = this.loadTimetableState();
        }
        if (!Array.isArray(this.timetableState.semesters)) this.timetableState.semesters = [];
        if (!Array.isArray(this.timetableState.schemes)) this.timetableState.schemes = [];
        if (!Array.isArray(this.timetableState.courses)) this.timetableState.courses = [];

        if (this.timetableState.schemes.length === 0) {
            const schemeId = this.createTimetableId('scheme');
            this.timetableState.schemes.push({
                id: schemeId,
                name: '默认作息',
                periods: [
                    { index: 1, start: '08:00', end: '08:45' },
                    { index: 2, start: '08:55', end: '09:40' },
                    { index: 3, start: '10:00', end: '10:45' },
                    { index: 4, start: '10:55', end: '11:40' },
                    { index: 5, start: '14:00', end: '14:45' },
                    { index: 6, start: '14:55', end: '15:40' },
                    { index: 7, start: '16:00', end: '16:45' },
                    { index: 8, start: '16:55', end: '17:40' }
                ]
            });
            this.timetableState.editingSchemeId = schemeId;
        }

        const semesters = this.timetableState.semesters;
        const activeId = this.timetableState.activeSemesterId;
        if (activeId && !semesters.some(s => s?.id === activeId)) {
            this.timetableState.activeSemesterId = semesters[0]?.id || '';
        } else if (!activeId && semesters[0]?.id) {
            this.timetableState.activeSemesterId = semesters[0].id;
        }

        const schemes = this.timetableState.schemes;
        const editingId = this.timetableState.editingSchemeId;
        if (editingId && !schemes.some(s => s?.id === editingId)) {
            this.timetableState.editingSchemeId = schemes[0]?.id || '';
        } else if (!editingId && schemes[0]?.id) {
            this.timetableState.editingSchemeId = schemes[0].id;
        }

        const activeSemester = this.getTimetableActiveSemester();
        if (activeSemester?.startDate) {
            const start = new Date(`${activeSemester.startDate}T00:00:00`);
            const end = activeSemester?.endDate ? new Date(`${activeSemester.endDate}T00:00:00`) : null;
            const today = new Date();
            const within = end && !Number.isNaN(end.getTime()) ? (today >= start && today <= end) : today >= start;
            this.timetableViewDate = within ? today : start;
        }

        this.saveTimetableState();
        this.timetableInitialized = true;
    }

    renderTimetableAll() {
        const moduleEl = document.getElementById('timetableModule');
        if (!moduleEl) return;

        this.renderTimetableSemesterUI();
        this.renderTimetableSchemeUI();
        this.renderTimetableCourseFormUI();
        this.renderTimetableGrid();
        this.updateTimetableStats();
    }

    openTimetableSettingsModal() {
        const modal = document.getElementById('timetableSettingsModal');
        if (!modal) return;
        this.initTimetableIfNeeded();
        this.renderTimetableAll();
        this.clearTimetableSettingsFeedback();
        modal.classList.add('active');
    }

    closeTimetableSettingsModal() {
        const modal = document.getElementById('timetableSettingsModal');
        if (!modal) return;
        modal.classList.remove('active');
        this.clearTimetableSettingsFeedback();
    }

    clearTimetableSettingsFeedback() {
        const el = document.getElementById('timetableSettingsFeedback');
        if (!el) return;
        el.textContent = '';
        el.classList.remove('is-visible', 'success', 'error', 'info');
        if (this.timetableFeedbackTimer) {
            window.clearTimeout(this.timetableFeedbackTimer);
            this.timetableFeedbackTimer = null;
        }
    }

    showTimetableSettingsFeedback(message, variant = 'info', duration = 1600) {
        const modal = document.getElementById('timetableSettingsModal');
        if (!modal || !modal.classList.contains('active')) return;
        const el = document.getElementById('timetableSettingsFeedback');
        if (!el) return;
        const text = String(message || '').trim();
        if (!text) return;
        el.textContent = text;
        el.classList.remove('success', 'error', 'info');
        el.classList.add('is-visible');
        el.classList.add(variant === 'success' ? 'success' : variant === 'error' ? 'error' : 'info');
        if (this.timetableFeedbackTimer) window.clearTimeout(this.timetableFeedbackTimer);
        this.timetableFeedbackTimer = window.setTimeout(() => {
            el.classList.remove('is-visible', 'success', 'error', 'info');
            el.textContent = '';
            this.timetableFeedbackTimer = null;
        }, Math.max(600, Number(duration) || 0));
    }

    queueTimetableSemesterAutoSave() {
        if (this.timetableAutoSaveTimers?.semester) window.clearTimeout(this.timetableAutoSaveTimers.semester);
        this.timetableAutoSaveTimers.semester = window.setTimeout(() => {
            this.timetableAutoSaveTimers.semester = null;
            this.tryAutoSaveActiveTimetableSemesterFromForm();
        }, 350);
    }

    tryAutoSaveActiveTimetableSemesterFromForm() {
        const active = this.getTimetableActiveSemester();
        if (!active) return;
        const academicYear = document.getElementById('timetableAcademicYear')?.value?.trim() || '';
        const termRaw = document.getElementById('timetableTerm')?.value || '1';
        const startDate = document.getElementById('timetableSemesterStart')?.value || '';
        const endDate = document.getElementById('timetableSemesterEnd')?.value || '';
        const schemeId = document.getElementById('timetableTimeSchemeSelect')?.value || '';
        if (!startDate || !endDate) return;
        if (startDate > endDate) {
            this.showTimetableSettingsFeedback('结束日期不能早于开始日期', 'error');
            return;
        }
        const term = Number(termRaw);
        const idx = this.timetableState.semesters.findIndex(s => s?.id === active.id);
        if (idx < 0) return;
        this.timetableState.semesters[idx] = {
            ...this.timetableState.semesters[idx],
            academicYear,
            term: Number.isFinite(term) ? term : 1,
            startDate,
            endDate,
            schemeId
        };
        this.saveTimetableState();
        this.renderTimetableSemesterUI();
        this.updateTimetableStats();
        this.showTimetableSettingsFeedback('学期设置已保存', 'success');
    }

    queueTimetableSchemeAutoSave() {
        if (this.timetableAutoSaveTimers?.scheme) window.clearTimeout(this.timetableAutoSaveTimers.scheme);
        this.timetableAutoSaveTimers.scheme = window.setTimeout(() => {
            this.timetableAutoSaveTimers.scheme = null;
            this.tryAutoSaveEditingTimetableSchemeFromForm();
        }, 350);
    }

    tryAutoSaveEditingTimetableSchemeFromForm() {
        const editing = this.getTimetableSchemeById(this.timetableState?.editingSchemeId || '');
        if (!editing) return;
        const name = document.getElementById('timetableSchemeName')?.value?.trim() || '';
        if (name) editing.name = name;

        const tbody = document.getElementById('timetablePeriodsBody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr[data-period-index]'));
        const periods = rows
            .map((row) => {
                const idx = Number(row.getAttribute('data-period-index'));
                const start = row.querySelector('.timetable-period-start')?.value || '';
                const end = row.querySelector('.timetable-period-end')?.value || '';
                return { index: Number.isFinite(idx) ? idx : 0, start, end };
            })
            .filter(p => p.index > 0);

        const complete = periods
            .filter(p => p.start && p.end)
            .sort((a, b) => a.index - b.index);

        if (complete.some(p => p.start >= p.end)) {
            this.showTimetableSettingsFeedback('作息时间有误：结束时间必须晚于开始时间', 'error');
            return;
        }

        if (complete.length) {
            editing.periods = complete;
        }

        this.saveTimetableState();
        this.renderTimetableCourseFormUI();
        this.renderTimetableGrid();
        this.updateTimetableStats();
        this.showTimetableSettingsFeedback('作息方案已保存', 'success');
    }

    renderTimetableSemesterUI() {
        const select = document.getElementById('timetableSemesterSelect');
        const academicYear = document.getElementById('timetableAcademicYear');
        const term = document.getElementById('timetableTerm');
        const start = document.getElementById('timetableSemesterStart');
        const end = document.getElementById('timetableSemesterEnd');
        const schemeSelect = document.getElementById('timetableTimeSchemeSelect');
        if (!select || !academicYear || !term || !start || !end || !schemeSelect) return;

        const semesters = Array.isArray(this.timetableState?.semesters) ? this.timetableState.semesters : [];
        const active = this.getTimetableActiveSemester();
        select.innerHTML = semesters.length
            ? semesters
                  .map(s => {
                      const labelParts = [];
                      if (s?.academicYear) labelParts.push(String(s.academicYear));
                      if (s?.term) labelParts.push(`第${String(s.term)}学期`);
                      const label = labelParts.length ? labelParts.join(' ') : '未命名学期';
                      return `<option value="${String(s.id)}"${active?.id === s.id ? ' selected' : ''}>${label}</option>`;
                  })
                  .join('')
            : `<option value="" selected>暂无学期</option>`;
        select.disabled = semesters.length === 0;

        const schemes = Array.isArray(this.timetableState?.schemes) ? this.timetableState.schemes : [];
        schemeSelect.innerHTML = schemes.length
            ? schemes
                  .map(sc => `<option value="${String(sc.id)}"${active?.schemeId === sc.id ? ' selected' : ''}>${String(sc.name || '未命名方案')}</option>`)
                  .join('')
            : `<option value="" selected>暂无方案</option>`;
        schemeSelect.disabled = schemes.length === 0 || semesters.length === 0;

        academicYear.value = active?.academicYear || '';
        term.value = active?.term ? String(active.term) : '1';
        start.value = active?.startDate || '';
        end.value = active?.endDate || '';
    }

    selectTimetableSemester(id) {
        if (!id) return;
        this.timetableState.activeSemesterId = id;
        this.saveTimetableState();
        const semester = this.getTimetableSemesterById(id);
        if (semester?.startDate) {
            const start = new Date(`${semester.startDate}T00:00:00`);
            if (!Number.isNaN(start.getTime())) this.timetableViewDate = start;
        }
        this.renderTimetableAll();
    }

    createTimetableSemester() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const term = month >= 2 && month <= 7 ? 2 : 1;
        const academicYear = term === 1 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
        const id = this.createTimetableId('semester');
        const startDate = this.formatDate(now);
        const endDate = this.formatDate(this.addDays(now, 7 * 18));
        const defaultScheme = (Array.isArray(this.timetableState?.schemes) ? this.timetableState.schemes : [])[0];
        const semester = {
            id,
            academicYear,
            term,
            startDate,
            endDate,
            schemeId: defaultScheme?.id || ''
        };
        this.timetableState.semesters.push(semester);
        this.timetableState.activeSemesterId = id;
        this.timetableViewDate = new Date(`${startDate}T00:00:00`);
        this.saveTimetableState();
        this.renderTimetableAll();
        this.showTimetableSettingsFeedback('已新建学期', 'success');
    }

    deleteActiveTimetableSemester() {
        const active = this.getTimetableActiveSemester();
        if (!active) return;
        const label = `${active.academicYear || ''} 第${active.term || ''}学期`.trim() || '该学期';
        if (!confirm(`确定删除 ${label} 吗？学期下的课程也会删除。`)) return;
        const id = active.id;
        this.timetableState.semesters = this.timetableState.semesters.filter(s => s?.id !== id);
        const removedCourses = this.timetableState.courses.filter(c => c?.semesterId === id);
        this.timetableState.courses = this.timetableState.courses.filter(c => c?.semesterId !== id);
        this.timetableState.activeSemesterId = this.timetableState.semesters[0]?.id || '';
        this.saveTimetableState();
        if (removedCourses.length) {
            this.removeTimetableCoursesFromTodoCalendar(removedCourses.map(c => c.id));
        }
        this.renderTimetableAll();
        this.showTimetableSettingsFeedback('学期已删除', 'success');
    }

    saveActiveTimetableSemesterFromForm() {
        const active = this.getTimetableActiveSemester();
        if (!active) {
            alert('请先新建一个学期');
            return;
        }
        const academicYear = document.getElementById('timetableAcademicYear')?.value?.trim() || '';
        const term = Number(document.getElementById('timetableTerm')?.value || '1');
        const startDate = document.getElementById('timetableSemesterStart')?.value || '';
        const endDate = document.getElementById('timetableSemesterEnd')?.value || '';
        const schemeId = document.getElementById('timetableTimeSchemeSelect')?.value || '';
        if (!startDate || !endDate) {
            alert('请选择学期开始日期和结束日期');
            return;
        }
        if (startDate > endDate) {
            alert('结束日期不能早于开始日期');
            return;
        }
        const idx = this.timetableState.semesters.findIndex(s => s?.id === active.id);
        if (idx < 0) return;
        this.timetableState.semesters[idx] = {
            ...this.timetableState.semesters[idx],
            academicYear,
            term: Number.isFinite(term) ? term : 1,
            startDate,
            endDate,
            schemeId
        };
        this.saveTimetableState();
        this.renderTimetableAll();
        this.showTimetableSettingsFeedback('学期信息已保存', 'success');
    }

    setActiveTimetableSemesterScheme(schemeId) {
        const active = this.getTimetableActiveSemester();
        if (!active) return;
        const idx = this.timetableState.semesters.findIndex(s => s?.id === active.id);
        if (idx < 0) return;
        this.timetableState.semesters[idx] = { ...this.timetableState.semesters[idx], schemeId: schemeId || '' };
        this.saveTimetableState();
        this.renderTimetableAll();
        this.showTimetableSettingsFeedback('作息方案已应用到学期', 'success');
    }

    renderTimetableSchemeUI() {
        const select = document.getElementById('timetableSchemeSelect');
        const nameInput = document.getElementById('timetableSchemeName');
        const tbody = document.getElementById('timetablePeriodsBody');
        if (!select || !nameInput || !tbody) return;

        const schemes = Array.isArray(this.timetableState?.schemes) ? this.timetableState.schemes : [];
        const editingId = this.timetableState?.editingSchemeId || '';
        const editing = this.getTimetableSchemeById(editingId) || schemes[0] || null;
        if (editing && editing.id !== editingId) this.timetableState.editingSchemeId = editing.id;

        select.innerHTML = schemes.length
            ? schemes
                  .map(s => `<option value="${String(s.id)}"${editing?.id === s.id ? ' selected' : ''}>${String(s.name || '未命名方案')}</option>`)
                  .join('')
            : `<option value="" selected>暂无方案</option>`;
        select.disabled = schemes.length === 0;

        nameInput.value = editing?.name || '';

        const periods = Array.isArray(editing?.periods) ? editing.periods : [];
        const normalized = periods
            .map(p => ({
                index: Number(p?.index) || 0,
                start: typeof p?.start === 'string' ? p.start : '',
                end: typeof p?.end === 'string' ? p.end : ''
            }))
            .filter(p => p.index > 0)
            .sort((a, b) => a.index - b.index);

        tbody.innerHTML = normalized.length
            ? normalized
                  .map(p => {
                      const safeIndex = String(p.index);
                      const startVal = p.start || '';
                      const endVal = p.end || '';
                      return `
                        <tr data-period-index="${safeIndex}">
                            <td>${safeIndex}</td>
                            <td><input type="time" class="timetable-period-start" value="${startVal}"></td>
                            <td><input type="time" class="timetable-period-end" value="${endVal}"></td>
                            <td><button type="button" class="btn btn-outline btn-icon" data-timetable-delete-period="${safeIndex}" aria-label="删除"><i class="fas fa-trash"></i></button></td>
                        </tr>
                      `;
                  })
                  .join('')
            : `<tr><td colspan="4" style="opacity:.65;">暂无节次，请添加</td></tr>`;
    }

    selectTimetableSchemeForEdit(id) {
        if (!id) return;
        this.timetableState.editingSchemeId = id;
        this.saveTimetableState();
        this.renderTimetableAll();
    }

    createTimetableScheme() {
        const id = this.createTimetableId('scheme');
        const scheme = {
            id,
            name: '新作息方案',
            periods: [{ index: 1, start: '08:00', end: '08:45' }]
        };
        this.timetableState.schemes.push(scheme);
        this.timetableState.editingSchemeId = id;
        this.saveTimetableState();
        this.renderTimetableAll();
        this.showTimetableSettingsFeedback('已新建作息方案', 'success');
    }

    addPeriodToEditingScheme() {
        const editing = this.getTimetableSchemeById(this.timetableState?.editingSchemeId || '');
        if (!editing) return;
        if (!Array.isArray(editing.periods)) editing.periods = [];
        const maxIndex = editing.periods.reduce((m, p) => Math.max(m, Number(p?.index) || 0), 0);
        editing.periods.push({ index: maxIndex + 1, start: '', end: '' });
        this.saveTimetableState();
        this.renderTimetableAll();
        this.showTimetableSettingsFeedback('已添加节次', 'success');
    }

    deletePeriodFromEditingScheme(periodIndex) {
        const idx = Number(periodIndex);
        if (!Number.isFinite(idx) || idx <= 0) return;
        const editing = this.getTimetableSchemeById(this.timetableState?.editingSchemeId || '');
        if (!editing) return;
        const used = (Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : []).some(c => {
            if (!c || Number(c.periodIndex) !== idx) return false;
            const semester = this.getTimetableSemesterById(c.semesterId);
            return semester?.schemeId === editing.id;
        });
        if (used) {
            alert('该节次已被课程使用，无法删除');
            return;
        }
        editing.periods = (Array.isArray(editing.periods) ? editing.periods : [])
            .filter(p => Number(p?.index) !== idx)
            .map(p => ({
                index: Number(p?.index) || 0,
                start: typeof p?.start === 'string' ? p.start : '',
                end: typeof p?.end === 'string' ? p.end : ''
            }))
            .filter(p => p.index > 0)
            .sort((a, b) => a.index - b.index);
        this.saveTimetableState();
        this.renderTimetableAll();
        this.showTimetableSettingsFeedback('节次已删除', 'success');
    }

    saveEditingTimetableSchemeFromForm() {
        const editing = this.getTimetableSchemeById(this.timetableState?.editingSchemeId || '');
        if (!editing) return;
        const name = document.getElementById('timetableSchemeName')?.value?.trim() || '';
        const tbody = document.getElementById('timetablePeriodsBody');
        if (!tbody) return;
        const rows = Array.from(tbody.querySelectorAll('tr[data-period-index]'));
        const periods = rows
            .map((row) => {
                const idx = Number(row.getAttribute('data-period-index'));
                const start = row.querySelector('.timetable-period-start')?.value || '';
                const end = row.querySelector('.timetable-period-end')?.value || '';
                return { index: Number.isFinite(idx) ? idx : 0, start, end };
            })
            .filter(p => p.index > 0)
            .filter(p => p.start || p.end)
            .sort((a, b) => a.index - b.index);
        if (periods.length === 0) {
            alert('请至少配置一个节次');
            return;
        }
        for (const p of periods) {
            if (!p.start || !p.end) {
                alert('请填写每个节次的开始和结束时间');
                return;
            }
            if (p.start >= p.end) {
                alert('结束时间必须晚于开始时间');
                return;
            }
        }
        editing.name = name || editing.name || '未命名方案';
        editing.periods = periods;
        this.saveTimetableState();
        this.renderTimetableAll();
        this.showTimetableSettingsFeedback('作息方案已保存', 'success');
    }

    renderTimetableCourseFormUI() {
        const active = this.getTimetableActiveSemester();
        const periodSelect = document.getElementById('timetableCoursePeriod');
        const examStartSelect = document.getElementById('timetableExamStartPeriod');
        const examEndSelect = document.getElementById('timetableExamEndPeriod');
        const datalist = document.getElementById('timetableClassroomList');
        if (!datalist) return;
        if (!periodSelect && !(examStartSelect && examEndSelect)) return;

        const scheme = this.getTimetableActiveSchemeForSemester(active);
        const periods = Array.isArray(scheme?.periods) ? scheme.periods : [];
        const normalized = periods
            .map(p => ({
                index: Number(p?.index) || 0,
                start: typeof p?.start === 'string' ? p.start : '',
                end: typeof p?.end === 'string' ? p.end : ''
            }))
            .filter(p => p.index > 0)
            .sort((a, b) => a.index - b.index);
        const optionsHtml = normalized.length
            ? normalized
                  .map(p => {
                      const label = p.start && p.end ? `第${p.index}节（${p.start}-${p.end}）` : `第${p.index}节`;
                      return `<option value="${String(p.index)}">${label}</option>`;
                  })
                  .join('')
            : `<option value="" selected>请先配置作息</option>`;
        if (periodSelect) {
            periodSelect.innerHTML = optionsHtml;
            periodSelect.disabled = normalized.length === 0 || !active;
        }
        if (examStartSelect) {
            examStartSelect.innerHTML = optionsHtml;
            examStartSelect.disabled = normalized.length === 0 || !active;
        }
        if (examEndSelect) {
            examEndSelect.innerHTML = optionsHtml;
            examEndSelect.disabled = normalized.length === 0 || !active;
        }

        const locations = Array.from(
            new Set(
                (Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : [])
                    .map(c => String(c?.location || '').trim())
                    .filter(Boolean)
            )
        ).sort((a, b) => a.localeCompare(b, 'zh-CN'));
        datalist.innerHTML = locations.map(l => `<option value="${l}"></option>`).join('');

        this.updateTimetableCourseTypeUI();
        this.normalizeTimetableExamPeriodRange();
    }

    updateTimetableCourseTypeUI() {
        const type = document.getElementById('timetableCourseType')?.value || 'other';
        const examFields = document.getElementById('timetableExamFields');
        const periodGroup = document.getElementById('timetableCoursePeriod')?.closest?.('.form-group') || null;
        const parityGrid = document.getElementById('timetableParityEnabled')?.closest?.('.timetable-form-grid') || null;
        const parityEnabled = document.getElementById('timetableParityEnabled');
        const parityType = document.getElementById('timetableParityType');

        const isExam = type === 'exam';
        if (examFields) examFields.style.display = isExam ? '' : 'none';
        if (periodGroup) periodGroup.style.display = isExam ? 'none' : '';
        if (parityGrid) parityGrid.style.display = isExam ? 'none' : '';
        if (parityEnabled) parityEnabled.checked = isExam ? false : Boolean(parityEnabled.checked);
        if (parityType) parityType.disabled = isExam ? true : !Boolean(parityEnabled?.checked);
    }

    normalizeTimetableExamPeriodRange() {
        const startEl = document.getElementById('timetableExamStartPeriod');
        const endEl = document.getElementById('timetableExamEndPeriod');
        if (!startEl || !endEl) return;
        const s = Number(startEl.value || '0');
        const e = Number(endEl.value || '0');
        if (!Number.isFinite(s) || !Number.isFinite(e) || s <= 0 || e <= 0) return;
        if (s > e) endEl.value = String(s);
    }

    syncTimetableExamWeekdayFromDate() {
        const dateValue = document.getElementById('timetableExamDate')?.value || '';
        const weekdayEl = document.getElementById('timetableCourseWeekday');
        if (!dateValue || !weekdayEl) return;
        const d = new Date(`${dateValue}T00:00:00`);
        if (Number.isNaN(d.getTime())) return;
        const js = d.getDay();
        const weekday = js === 0 ? 7 : js;
        weekdayEl.value = String(weekday);
    }

    resetTimetableCourseForm() {
        const id = document.getElementById('timetableCourseId');
        const name = document.getElementById('timetableCourseName');
        const type = document.getElementById('timetableCourseType');
        const weekday = document.getElementById('timetableCourseWeekday');
        const period = document.getElementById('timetableCoursePeriod');
        const examDate = document.getElementById('timetableExamDate');
        const examStartPeriod = document.getElementById('timetableExamStartPeriod');
        const examEndPeriod = document.getElementById('timetableExamEndPeriod');
        const examStartTime = document.getElementById('timetableExamStartTime');
        const examEndTime = document.getElementById('timetableExamEndTime');
        const parityEnabled = document.getElementById('timetableParityEnabled');
        const parityType = document.getElementById('timetableParityType');
        const location = document.getElementById('timetableCourseLocation');
        const color = document.getElementById('timetableCourseColor');
        if (id) id.value = '';
        if (name) name.value = '';
        if (type) type.value = 'other';
        if (weekday) weekday.value = '1';
        if (period && period.options.length) period.value = period.options[0].value;
        if (examDate) examDate.value = '';
        if (examStartPeriod && examStartPeriod.options.length) examStartPeriod.value = examStartPeriod.options[0].value;
        if (examEndPeriod && examEndPeriod.options.length) examEndPeriod.value = examEndPeriod.options[0].value;
        if (examStartTime) examStartTime.value = '';
        if (examEndTime) examEndTime.value = '';
        if (parityEnabled) parityEnabled.checked = false;
        if (parityType) {
            parityType.disabled = true;
            parityType.value = 'odd';
        }
        if (location) location.value = '';
        if (color) color.value = '#e78367';
        const error = document.getElementById('timetableCourseNameError');
        if (error) error.textContent = '';
        this.updateTimetableCourseTypeUI();
    }

    getTimetablePriorityForCourseType(type) {
        const map = { required: 'high', elective: 'medium', lab: 'medium', self: 'low', exam: 'high', other: 'low' };
        return map[type] || 'medium';
    }

    getTimetableCourseTimeRange(course, semester) {
        const scheme = this.getTimetableActiveSchemeForSemester(semester);
        const periods = Array.isArray(scheme?.periods) ? scheme.periods : [];
        const idx = Number(course?.periodIndex);
        const startIdx = Number(course?.type === 'exam' ? (course?.examStartPeriodIndex ?? idx) : idx);
        const endIdx = Number(course?.type === 'exam' ? (course?.examEndPeriodIndex ?? startIdx) : idx);
        const startPeriod = periods.find(p => Number(p?.index) === startIdx) || null;
        const endPeriod = periods.find(p => Number(p?.index) === endIdx) || null;
        const start = course?.type === 'exam' ? (course?.examStartTime || startPeriod?.start || '') : (typeof startPeriod?.start === 'string' ? startPeriod.start : '');
        const end = course?.type === 'exam' ? (course?.examEndTime || endPeriod?.end || '') : (typeof startPeriod?.end === 'string' ? startPeriod.end : '');
        return { start, end, scheme, period: startPeriod, endPeriod };
    }

    rangesOverlap(aStart, aEnd, bStart, bEnd) {
        if (!aStart || !aEnd || !bStart || !bEnd) return false;
        return aStart < bEnd && bStart < aEnd;
    }

    periodRangesOverlap(aStart, aEnd, bStart, bEnd) {
        const as = Number(aStart);
        const ae = Number(aEnd);
        const bs = Number(bStart);
        const be = Number(bEnd);
        if (!Number.isFinite(as) || !Number.isFinite(ae) || !Number.isFinite(bs) || !Number.isFinite(be)) return false;
        if (as <= 0 || ae <= 0 || bs <= 0 || be <= 0) return false;
        const a1 = Math.min(as, ae);
        const a2 = Math.max(as, ae);
        const b1 = Math.min(bs, be);
        const b2 = Math.max(bs, be);
        return a1 <= b2 && b1 <= a2;
    }

    getTimetableCourseConflicts(candidate) {
        const semester = this.getTimetableSemesterById(candidate.semesterId);
        if (!semester) return [];
        const list = Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : [];
        const others = list.filter(c => c && c.id !== candidate.id && c.semesterId === candidate.semesterId);
        const candidateIsExam = candidate?.type === 'exam';
        const candidateWeekday = Number(candidate.weekday);
        const candidatePeriodIndex = Number(candidate.periodIndex);
        const candidateExamDate = typeof candidate?.examDate === 'string' ? candidate.examDate : '';
        const candidateExamStartPeriod = Number(candidate?.examStartPeriodIndex ?? candidatePeriodIndex);
        const candidateExamEndPeriod = Number(candidate?.examEndPeriodIndex ?? candidateExamStartPeriod);
        const { start: candidateStart, end: candidateEnd } = this.getTimetableCourseTimeRange(candidate, semester);

        const isDateWithinSemester = (isoDate) => {
            if (!isoDate) return false;
            if (semester?.startDate && isoDate < semester.startDate) return false;
            if (semester?.endDate && isoDate > semester.endDate) return false;
            return true;
        };

        const matchParityOnDate = (course, dateObj) => {
            if (!dateObj) return false;
            const teachingWeek = this.getTeachingWeekForDate(dateObj, semester);
            if (course?.parity === 'odd' && teachingWeek && teachingWeek % 2 === 0) return false;
            if (course?.parity === 'even' && teachingWeek && teachingWeek % 2 === 1) return false;
            return true;
        };

        const overlapsByTimeOrPeriod = (aCourse, bCourse, aStart, aEnd, bStart, bEnd) => {
            const aP1 = Number(aCourse?.type === 'exam' ? (aCourse?.examStartPeriodIndex ?? aCourse?.periodIndex) : aCourse?.periodIndex);
            const aP2 = Number(aCourse?.type === 'exam' ? (aCourse?.examEndPeriodIndex ?? aP1) : aP1);
            const bP1 = Number(bCourse?.type === 'exam' ? (bCourse?.examStartPeriodIndex ?? bCourse?.periodIndex) : bCourse?.periodIndex);
            const bP2 = Number(bCourse?.type === 'exam' ? (bCourse?.examEndPeriodIndex ?? bP1) : bP1);
            const byTime = this.rangesOverlap(aStart, aEnd, bStart, bEnd);
            const byPeriod = this.periodRangesOverlap(aP1, aP2, bP1, bP2);
            return byTime || byPeriod;
        };

        if (candidateIsExam) {
            if (!candidateExamDate) return [];
            const d = new Date(`${candidateExamDate}T00:00:00`);
            if (Number.isNaN(d.getTime())) return [];
            const jsDay = d.getDay();
            const weekdayFromDate = jsDay === 0 ? 7 : jsDay;
            const within = isDateWithinSemester(candidateExamDate);

            return others
                .filter(c => {
                    const isExam = c?.type === 'exam';
                    if (isExam) return String(c?.examDate || '') === candidateExamDate;
                    if (!within) return false;
                    if (Number(c?.weekday) !== weekdayFromDate) return false;
                    return matchParityOnDate(c, d);
                })
                .filter(c => {
                    const { start: s2, end: e2 } = this.getTimetableCourseTimeRange(c, semester);
                    return overlapsByTimeOrPeriod(candidate, c, candidateStart, candidateEnd, s2, e2);
                });
        }

        return others
            .filter(c => {
                const isExam = c?.type === 'exam';
                if (!isExam) return Number(c.weekday) === candidateWeekday;
                const examDate = String(c?.examDate || '');
                if (!examDate || !isDateWithinSemester(examDate)) return false;
                const d = new Date(`${examDate}T00:00:00`);
                if (Number.isNaN(d.getTime())) return false;
                const jsDay = d.getDay();
                const weekdayFromDate = jsDay === 0 ? 7 : jsDay;
                if (weekdayFromDate !== candidateWeekday) return false;
                return matchParityOnDate(candidate, d);
            })
            .filter(c => {
                const { start: s2, end: e2 } = this.getTimetableCourseTimeRange(c, semester);
                return overlapsByTimeOrPeriod(candidate, c, candidateStart, candidateEnd, s2, e2);
            });
    }

    saveTimetableCourseFromForm() {
        const activeSemester = this.getTimetableActiveSemester();
        if (!activeSemester) {
            alert('请先新建并选择一个学期');
            return;
        }

        const id = document.getElementById('timetableCourseId')?.value || '';
        const name = document.getElementById('timetableCourseName')?.value?.trim() || '';
        const type = document.getElementById('timetableCourseType')?.value || 'other';
        let weekday = Number(document.getElementById('timetableCourseWeekday')?.value || '1');
        let periodIndex = Number(document.getElementById('timetableCoursePeriod')?.value || '0');
        const parityEnabled = Boolean(document.getElementById('timetableParityEnabled')?.checked);
        const parityType = document.getElementById('timetableParityType')?.value || 'odd';
        const location = document.getElementById('timetableCourseLocation')?.value?.trim() || '';
        const color = document.getElementById('timetableCourseColor')?.value || '#e78367';

        const error = document.getElementById('timetableCourseNameError');
        if (error) error.textContent = '';

        if (!name) {
            if (error) error.textContent = '课程名称不能为空';
            return;
        }
        if (!Number.isFinite(weekday) || weekday < 1 || weekday > 7) {
            alert('请选择正确的星期');
            return;
        }
        const isExam = type === 'exam';
        const examDate = document.getElementById('timetableExamDate')?.value || '';
        const examStartPeriodIndex = Number(document.getElementById('timetableExamStartPeriod')?.value || '0');
        const examEndPeriodIndex = Number(document.getElementById('timetableExamEndPeriod')?.value || '0');
        const examStartTime = document.getElementById('timetableExamStartTime')?.value || '';
        const examEndTime = document.getElementById('timetableExamEndTime')?.value || '';

        let examWeekdayFromDate = null;
        if (isExam) {
            if (!examDate) {
                alert('请选择考试日期');
                return;
            }
            const d = new Date(`${examDate}T00:00:00`);
            if (Number.isNaN(d.getTime())) {
                alert('考试日期不合法');
                return;
            }
            const js = d.getDay();
            examWeekdayFromDate = js === 0 ? 7 : js;
            weekday = Number(examWeekdayFromDate);

            if (!Number.isFinite(examStartPeriodIndex) || examStartPeriodIndex <= 0 || !Number.isFinite(examEndPeriodIndex) || examEndPeriodIndex <= 0) {
                alert('请选择考试节次范围');
                return;
            }
            if (examStartPeriodIndex > examEndPeriodIndex) {
                alert('考试节次范围不合法');
                return;
            }
            if (!examStartTime || !examEndTime) {
                alert('请选择考试开始与结束时间');
                return;
            }
            if (examStartTime >= examEndTime) {
                alert('考试结束时间必须晚于开始时间');
                return;
            }
            if (activeSemester?.startDate && activeSemester?.endDate) {
                if (examDate < activeSemester.startDate || examDate > activeSemester.endDate) {
                    if (!confirm('考试日期超出当前学期范围，仍要保存吗？')) return;
                }
            }
            periodIndex = examStartPeriodIndex;
        } else {
            if (!Number.isFinite(periodIndex) || periodIndex <= 0) {
                alert('请先配置作息方案，并选择节次');
                return;
            }
        }

        const course = {
            id: id || this.createTimetableId('course'),
            semesterId: activeSemester.id,
            name,
            type,
            weekday,
            periodIndex,
            parity: isExam ? 'all' : (parityEnabled ? (parityType === 'even' ? 'even' : 'odd') : 'all'),
            location,
            color,
            ...(isExam
                ? {
                      examDate,
                      examStartTime,
                      examEndTime,
                      examStartPeriodIndex,
                      examEndPeriodIndex
                  }
                : {})
        };

        const conflicts = this.getTimetableCourseConflicts(course);
        if (conflicts.length) {
            const first = conflicts[0];
            alert(`课程冲突：与「${first.name || '未命名课程'}」时间重叠`);
            return;
        }

        const list = Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : [];
        const existingIndex = list.findIndex(c => c?.id === course.id);
        if (existingIndex >= 0) {
            list[existingIndex] = { ...list[existingIndex], ...course };
        } else {
            list.push(course);
        }
        this.timetableState.courses = list;
        this.saveTimetableState();

        this.resetTimetableCourseForm();
        this.renderTimetableAll();
        this.syncTimetableCoursesToTodoCalendar([course.id]);
        this.showTimetableSettingsFeedback(isExam ? '考试已保存并同步到待办日历' : '课程已保存并同步到待办日历', 'success', 2200);
    }

    editTimetableCourse(courseId) {
        const course = (Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : []).find(c => c?.id === courseId) || null;
        if (!course) return;
        const semester = this.getTimetableSemesterById(course.semesterId);
        if (semester?.id && semester.id !== this.timetableState.activeSemesterId) {
            this.timetableState.activeSemesterId = semester.id;
        }
        const id = document.getElementById('timetableCourseId');
        const name = document.getElementById('timetableCourseName');
        const type = document.getElementById('timetableCourseType');
        const weekday = document.getElementById('timetableCourseWeekday');
        const period = document.getElementById('timetableCoursePeriod');
        const examDate = document.getElementById('timetableExamDate');
        const examStartPeriod = document.getElementById('timetableExamStartPeriod');
        const examEndPeriod = document.getElementById('timetableExamEndPeriod');
        const examStartTime = document.getElementById('timetableExamStartTime');
        const examEndTime = document.getElementById('timetableExamEndTime');
        const parityEnabled = document.getElementById('timetableParityEnabled');
        const parityType = document.getElementById('timetableParityType');
        const location = document.getElementById('timetableCourseLocation');
        const color = document.getElementById('timetableCourseColor');
        if (id) id.value = course.id;
        if (name) name.value = course.name || '';
        if (type) type.value = course.type || 'other';
        if (weekday) weekday.value = String(course.weekday || 1);
        if (period) period.value = String(course.periodIndex || 1);
        if (examDate) examDate.value = course.type === 'exam' ? String(course.examDate || '') : '';
        if (examStartPeriod) examStartPeriod.value = String(course.type === 'exam' ? (course.examStartPeriodIndex || course.periodIndex || 1) : (examStartPeriod.options[0]?.value || '1'));
        if (examEndPeriod) examEndPeriod.value = String(course.type === 'exam' ? (course.examEndPeriodIndex || course.examStartPeriodIndex || course.periodIndex || 1) : (examEndPeriod.options[0]?.value || '1'));
        if (examStartTime) examStartTime.value = course.type === 'exam' ? String(course.examStartTime || '') : '';
        if (examEndTime) examEndTime.value = course.type === 'exam' ? String(course.examEndTime || '') : '';
        const parity = course.parity || 'all';
        if (course.type === 'exam') {
            if (parityEnabled) parityEnabled.checked = false;
            if (parityType) {
                parityType.disabled = true;
                parityType.value = 'odd';
            }
        } else {
            if (parityEnabled) parityEnabled.checked = parity !== 'all';
            if (parityType) {
                parityType.disabled = parity === 'all';
                parityType.value = parity === 'even' ? 'even' : 'odd';
            }
        }
        if (location) location.value = course.location || '';
        if (color) color.value = course.color || '#e78367';
        const error = document.getElementById('timetableCourseNameError');
        if (error) error.textContent = '';

        this.updateTimetableCourseTypeUI();
        this.normalizeTimetableExamPeriodRange();
        this.saveTimetableState();
        this.renderTimetableAll();
    }

    deleteTimetableCourse(courseId) {
        const course = (Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : []).find(c => c?.id === courseId) || null;
        if (!course) return;
        if (!confirm(`确定删除课程「${course.name || '未命名'}」吗？`)) return;
        this.timetableState.courses = this.timetableState.courses.filter(c => c?.id !== courseId);
        this.saveTimetableState();
        this.removeTimetableCoursesFromTodoCalendar([courseId]);
        this.renderTimetableAll();
        this.closeTimetableCourseModal();
        this.showTimetableSettingsFeedback('课程已删除', 'success');
    }

    getTimetableWeekDates() {
        const weekStart = this.getStartOfWeek(this.timetableViewDate || new Date());
        return Array.from({ length: 7 }).map((_, i) => this.addDays(weekStart, i));
    }

    getTimetableCoursesForWeek() {
        const active = this.getTimetableActiveSemester();
        if (!active) return [];
        const weekDates = this.getTimetableWeekDates();
        const weekDateMap = new Map(weekDates.map(d => [this.formatDate(d), d]));
        const courses = (Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : []).filter(c => c?.semesterId === active.id);
        const results = [];
        courses.forEach(course => {
            if (course?.type === 'exam') {
                const isoDate = String(course?.examDate || '');
                const date = weekDateMap.get(isoDate) || null;
                if (!date) return;
                const within = active.startDate && active.endDate ? isoDate >= active.startDate && isoDate <= active.endDate : true;
                if (!within) return;
                results.push({ course, date, dateKey: isoDate });
                return;
            }
            const weekday = Number(course.weekday) || 1;
            const date = weekDates[weekday - 1] || null;
            if (!date) return;
            const dateKey = this.formatDate(date);
            const within = active.startDate && active.endDate ? dateKey >= active.startDate && dateKey <= active.endDate : true;
            if (!within) return;
            const teachingWeek = this.getTeachingWeekForDate(date, active);
            if (course.parity === 'odd' && teachingWeek && teachingWeek % 2 === 0) return;
            if (course.parity === 'even' && teachingWeek && teachingWeek % 2 === 1) return;
            results.push({ course, date, dateKey });
        });
        return results;
    }

    renderTimetableGrid() {
        const grid = document.getElementById('timetableGrid');
        if (!grid) return;
        const active = this.getTimetableActiveSemester();
        const scheme = this.getTimetableActiveSchemeForSemester(active);
        const periods = Array.isArray(scheme?.periods) ? scheme.periods : [];
        const normalizedPeriods = periods
            .map(p => ({ index: Number(p?.index) || 0, start: p?.start || '', end: p?.end || '' }))
            .filter(p => p.index > 0)
            .sort((a, b) => a.index - b.index);

        const weekDates = this.getTimetableWeekDates();
        const weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const coursesForWeek = this.getTimetableCoursesForWeek();
        const cellKey = (weekday, periodIndex) => `${weekday}-${periodIndex}`;
        const map = new Map();
        coursesForWeek.forEach(({ course, dateKey, date }) => {
            const w = Number(course.weekday);
            if (course?.type === 'exam') {
                const startP = Number(course?.examStartPeriodIndex ?? course?.periodIndex);
                const endP = Number(course?.examEndPeriodIndex ?? startP);
                if (Number.isFinite(startP) && Number.isFinite(endP) && startP > 0) {
                    for (let p = Math.min(startP, endP); p <= Math.max(startP, endP); p += 1) {
                        map.set(cellKey(w, p), { course, dateKey, date });
                    }
                }
                return;
            }
            map.set(cellKey(w, Number(course.periodIndex)), { course, dateKey, date });
        });

        if (!active) {
            grid.innerHTML = `<div class="pwa-empty-state"><i class="fas fa-table"></i><h3>暂无学期</h3><p>先新建一个学期，再添加课程</p></div>`;
            return;
        }
        if (normalizedPeriods.length === 0) {
            grid.innerHTML = `<div class="pwa-empty-state"><i class="fas fa-clock"></i><h3>暂无作息</h3><p>先在作息方案里添加节次</p></div>`;
            return;
        }

        const headerCells = weekDates
            .map((d, i) => {
                const dateKey = this.formatDate(d);
                return `<div class="tt-head"><div class="tt-head-top">${weekdayNames[i]}</div><div class="tt-head-sub">${dateKey.slice(5)}</div></div>`;
            })
            .join('');

        const bodyRows = normalizedPeriods
            .map(p => {
                const label = p.start && p.end ? `${p.index}<div class="tt-period-time">${p.start}-${p.end}</div>` : String(p.index);
                const cells = weekDates
                    .map((d, i) => {
                        const weekday = i + 1;
                        const key = cellKey(weekday, p.index);
                        const entry = map.get(key);
                        if (!entry) {
                            return `<div class="tt-slot" data-timetable-date="${this.formatDate(d)}"></div>`;
                        }
                        const c = entry.course;
                        const title =
                            c.type === 'exam'
                                ? `${c.name || ''}${c.examStartTime && c.examEndTime ? ` ${c.examStartTime}-${c.examEndTime}` : ''}${c.location ? ` @${c.location}` : ''}`
                                : `${c.name || ''}${c.location ? ` @${c.location}` : ''}`;
                        const badge =
                            c.type === 'required'
                                ? '必修'
                                : c.type === 'elective'
                                  ? '选修'
                                  : c.type === 'lab'
                                    ? '实验'
                                    : c.type === 'self'
                                      ? '自习'
                                      : c.type === 'exam'
                                        ? '考试'
                                        : '其他';
                        const parityLabel = c.parity === 'odd' ? '单' : c.parity === 'even' ? '双' : '';
                        const badgeText = parityLabel ? `${badge}·${parityLabel}` : badge;
                        const examTimeText = c.type === 'exam' && c.examStartTime && c.examEndTime ? ` · ${c.examStartTime}-${c.examEndTime}` : '';
                        return `
                            <div class="tt-slot" data-timetable-date="${entry.dateKey}">
                                <button type="button" class="tt-course" style="background:${c.color || '#e78367'}" data-timetable-course-id="${c.id}" data-timetable-date="${entry.dateKey}" title="${title}">
                                    <div class="tt-course-name">${c.name || ''}</div>
                                    <div class="tt-course-meta">${badgeText}${examTimeText}${c.location ? ` · ${c.location}` : ''}</div>
                                </button>
                            </div>
                        `;
                    })
                    .join('');
                return `<div class="tt-period">${label}</div>${cells}`;
            })
            .join('');

        grid.innerHTML = `<div class="tt-grid">${'<div class="tt-corner"></div>' + headerCells + bodyRows}</div>`;
    }

    updateTimetableStats() {
        const weekLabel = document.getElementById('timetableWeekLabel');
        const courseCount = document.getElementById('timetableCourseCount');
        const teachingWeekEl = document.getElementById('timetableTeachingWeek');
        const isoWeekEl = document.getElementById('timetableIsoWeek');
        const active = this.getTimetableActiveSemester();
        const weekStart = this.getStartOfWeek(this.timetableViewDate || new Date());
        const weekEnd = this.addDays(weekStart, 6);
        if (weekLabel) weekLabel.textContent = `${this.formatDate(weekStart)} ~ ${this.formatDate(weekEnd)}`;
        if (courseCount) {
            const count = active ? (Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : []).filter(c => c?.semesterId === active.id).length : 0;
            courseCount.textContent = String(count);
        }
        if (teachingWeekEl) {
            const n = active ? this.getTeachingWeekForDate(weekStart, active) : null;
            teachingWeekEl.textContent = n ? String(n) : '-';
        }
        if (isoWeekEl) {
            const iso = this.getIsoWeek(weekStart);
            isoWeekEl.textContent = String(iso.week);
        }
    }

    shiftTimetableWeek(delta) {
        const step = Number(delta);
        if (!Number.isFinite(step)) return;
        this.timetableViewDate = this.addDays(this.timetableViewDate || new Date(), step * 7);
        this.renderTimetableAll();
    }

    goToTimetableCurrentWeek() {
        this.timetableViewDate = new Date();
        this.renderTimetableAll();
    }

    openTimetableCourseModal(courseId, dateKey) {
        const modal = document.getElementById('timetableCourseModal');
        const titleEl = document.getElementById('timetableCourseModalTitle');
        const bodyEl = document.getElementById('timetableCourseModalBody');
        if (!modal || !titleEl || !bodyEl) return;
        const course = (Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : []).find(c => c?.id === courseId) || null;
        if (!course) return;
        const semester = this.getTimetableSemesterById(course.semesterId);
        const { start, end } = this.getTimetableCourseTimeRange(course, semester);
        const weekdayMap = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const typeMap = { required: '必修', elective: '选修', lab: '实验', self: '自习', exam: '考试', other: '其他' };
        const parity = course.parity === 'odd' ? '单周' : course.parity === 'even' ? '双周' : '每周';
        const timeText = start && end ? `${start}-${end}` : start || end || '-';
        const weekText = weekdayMap[(Number(course.weekday) || 1) - 1] || '周一';
        const isExam = course.type === 'exam';
        const startP = Number(isExam ? (course.examStartPeriodIndex ?? course.periodIndex) : course.periodIndex) || 1;
        const endP = Number(isExam ? (course.examEndPeriodIndex ?? startP) : course.periodIndex) || startP;
        const periodText = isExam ? `第${Math.min(startP, endP)}-${Math.max(startP, endP)}节` : `第${Number(course.periodIndex) || 1}节`;
        const dateText = isExam ? String(course.examDate || dateKey || '') : (dateKey || '');
        titleEl.textContent = course.name || '课程详情';
        bodyEl.innerHTML = `
            <div class="pwa-info-list">
                <div class="pwa-info-row"><span class="pwa-info-label">日期</span><span class="pwa-info-value">${dateText || '-'}</span></div>
                <div class="pwa-info-row"><span class="pwa-info-label">${isExam ? '考试时间' : '上课时间'}</span><span class="pwa-info-value">${weekText} · ${periodText} · ${timeText}</span></div>
                <div class="pwa-info-row"><span class="pwa-info-label">类型</span><span class="pwa-info-value">${typeMap[course.type] || '其他'}${isExam ? '' : ` · ${parity}`}</span></div>
                <div class="pwa-info-row"><span class="pwa-info-label">地点</span><span class="pwa-info-value">${course.location || '-'}</span></div>
                <div class="pwa-info-row"><span class="pwa-info-label">学期</span><span class="pwa-info-value">${semester ? `${semester.academicYear || ''} 第${semester.term || ''}学期`.trim() : '-'}</span></div>
            </div>
        `;
        modal.dataset.courseId = course.id;
        modal.dataset.date = dateKey || '';
        modal.classList.add('active');
    }

    closeTimetableCourseModal() {
        const modal = document.getElementById('timetableCourseModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.dataset.courseId = '';
        modal.dataset.date = '';
    }

    removeTimetableCoursesFromTodoCalendar(courseIds) {
        const ids = Array.isArray(courseIds) ? courseIds.filter(Boolean) : [];
        if (ids.length === 0) return;
        const todoSchedules = this.loadTodoCalendarSchedules();
        const idSet = new Set(ids);
        Object.keys(todoSchedules).forEach(dateKey => {
            const list = Array.isArray(todoSchedules[dateKey]) ? todoSchedules[dateKey] : [];
            todoSchedules[dateKey] = list.filter(item => !(item && item.timetableCourseId && idSet.has(item.timetableCourseId)));
        });
        this.saveTodoCalendarSchedules(todoSchedules);
    }

    syncTimetableCoursesToTodoCalendar(courseIds) {
        const ids = Array.isArray(courseIds) ? courseIds.filter(Boolean) : [];
        if (ids.length === 0) return;
        const courses = (Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : []).filter(c => ids.includes(c?.id));
        const semesters = Array.isArray(this.timetableState?.semesters) ? this.timetableState.semesters : [];
        const todoSchedules = this.loadTodoCalendarSchedules();

        const courseIdSet = new Set(ids);
        Object.keys(todoSchedules).forEach(dateKey => {
            const list = Array.isArray(todoSchedules[dateKey]) ? todoSchedules[dateKey] : [];
            todoSchedules[dateKey] = list.filter(item => !(item && item.timetableCourseId && courseIdSet.has(item.timetableCourseId)));
        });

        const ensureDayList = (dateKey) => {
            if (!Array.isArray(todoSchedules[dateKey])) todoSchedules[dateKey] = [];
        };

        courses.forEach(course => {
            const semester = semesters.find(s => s?.id === course.semesterId);
            if (!semester || !semester.startDate || !semester.endDate) return;

            if (course?.type === 'exam') {
                const examDate = String(course?.examDate || '');
                if (!examDate) return;
                const d = new Date(`${examDate}T00:00:00`);
                if (Number.isNaN(d.getTime())) return;
                const dateKey = d.toDateString();
                ensureDayList(dateKey);
                const itemId = `tt-${course.id}-${examDate}`;
                const locationText = course.location ? ` @${course.location}` : '';
                const timeRangeText = course.examStartTime && course.examEndTime ? `（${course.examStartTime}-${course.examEndTime}）` : '';
                const content = `[考试] ${course.name}${locationText}${timeRangeText}`;
                const priority = this.getTimetablePriorityForCourseType(course.type);
                const item = {
                    id: itemId,
                    time: course.examStartTime || '',
                    content,
                    priority,
                    timetableCourseId: course.id,
                    timetableCourseType: 'exam',
                    timetableExamDate: examDate,
                    timetableEndTime: course.examEndTime || ''
                };
                const existingIndex = todoSchedules[dateKey].findIndex(s => s?.id === itemId);
                if (existingIndex >= 0) {
                    todoSchedules[dateKey][existingIndex] = item;
                } else {
                    todoSchedules[dateKey].push(item);
                }
                return;
            }

            const scheme = this.getTimetableActiveSchemeForSemester(semester);
            const periods = Array.isArray(scheme?.periods) ? scheme.periods : [];
            const period = periods.find(p => Number(p?.index) === Number(course.periodIndex));
            const time = typeof period?.start === 'string' ? period.start : '';
            const endTime = typeof period?.end === 'string' ? period.end : '';

            const start = new Date(`${semester.startDate}T00:00:00`);
            const end = new Date(`${semester.endDate}T00:00:00`);
            start.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);

            for (let d = new Date(start); d <= end; d = this.addDays(d, 1)) {
                const jsDay = d.getDay();
                const weekday = jsDay === 0 ? 7 : jsDay;
                if (weekday !== Number(course.weekday)) continue;
                const dateKey = d.toDateString();
                const isoDate = this.formatDate(d);
                const teachingWeek = this.getTeachingWeekForDate(d, semester);
                if (course.parity === 'odd' && teachingWeek && teachingWeek % 2 === 0) continue;
                if (course.parity === 'even' && teachingWeek && teachingWeek % 2 === 1) continue;

                ensureDayList(dateKey);
                const itemId = `tt-${course.id}-${isoDate}`;
                const locationText = course.location ? ` @${course.location}` : '';
                const timeRangeText = time && endTime ? `（${time}-${endTime}）` : '';
                const content = `[课程表] ${course.name}${locationText}${timeRangeText}`;
                const priority = this.getTimetablePriorityForCourseType(course.type);
                const item = { id: itemId, time: time || '', content, priority, timetableCourseId: course.id, timetableCourseType: course.type || 'other' };

                const existingIndex = todoSchedules[dateKey].findIndex(s => s?.id === itemId);
                if (existingIndex >= 0) {
                    todoSchedules[dateKey][existingIndex] = item;
                } else {
                    todoSchedules[dateKey].push(item);
                }
            }
        });

        this.saveTodoCalendarSchedules(todoSchedules);
    }

    resyncTimetableToTodoCalendar() {
        const courses = Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : [];
        const todoSchedules = this.loadTodoCalendarSchedules();
        Object.keys(todoSchedules).forEach(dateKey => {
            const list = Array.isArray(todoSchedules[dateKey]) ? todoSchedules[dateKey] : [];
            todoSchedules[dateKey] = list.filter(item => !(item && item.timetableCourseId));
        });
        this.saveTodoCalendarSchedules(todoSchedules);
        this.syncTimetableCoursesToTodoCalendar(courses.map(c => c.id));
        this.showTimetableSettingsFeedback('课程表已重新同步到待办日历', 'success', 2200);
    }

    escapeIcsText(text) {
        return String(text || '')
            .replace(/\\/g, '\\\\')
            .replace(/\n/g, '\\n')
            .replace(/,/g, '\\,')
            .replace(/;/g, '\\;');
    }

    formatIcsLocalDateTime(date, time) {
        const [hh, mm] = String(time || '00:00').split(':').map(n => Number(n));
        const d = new Date(date);
        d.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    }

    exportTimetableIcs() {
        const active = this.getTimetableActiveSemester();
        const semesters = Array.isArray(this.timetableState?.semesters) ? this.timetableState.semesters : [];
        const courses = Array.isArray(this.timetableState?.courses) ? this.timetableState.courses : [];
        const scopeSemesters = active ? [active] : semesters;
        const scopeSemesterIds = new Set(scopeSemesters.map(s => s.id));
        const scopeCourses = courses.filter(c => scopeSemesterIds.has(c?.semesterId));
        if (scopeSemesters.length === 0 || scopeCourses.length === 0) {
            alert('暂无可导出的课程');
            return;
        }

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SelfSystem//Timetable//CN', 'CALSCALE:GREGORIAN'];

        scopeCourses.forEach(course => {
            const semester = semesters.find(s => s?.id === course.semesterId);
            if (!semester || !semester.startDate || !semester.endDate) return;
            const { start, end } = this.getTimetableCourseTimeRange(course, semester);
            if (!start || !end) return;

            if (course?.type === 'exam') {
                const examDate = String(course?.examDate || '');
                if (!examDate) return;
                const d = new Date(`${examDate}T00:00:00`);
                if (Number.isNaN(d.getTime())) return;
                const uid = `${course.id}-${examDate}@selfsystem`;
                lines.push('BEGIN:VEVENT');
                lines.push(`UID:${uid}`);
                lines.push(`DTSTAMP:${dtstamp}`);
                lines.push(`SUMMARY:${this.escapeIcsText((course.name ? `${course.name}（考试）` : '考试'))}`);
                lines.push(`DTSTART;TZID=Asia/Shanghai:${this.formatIcsLocalDateTime(d, start)}`);
                lines.push(`DTEND;TZID=Asia/Shanghai:${this.formatIcsLocalDateTime(d, end)}`);
                if (course.location) lines.push(`LOCATION:${this.escapeIcsText(course.location)}`);
                const descParts = [];
                if (semester.academicYear || semester.term) descParts.push(`${semester.academicYear || ''} 第${semester.term || ''}学期`.trim());
                const sp = Number(course?.examStartPeriodIndex ?? course?.periodIndex) || 1;
                const ep = Number(course?.examEndPeriodIndex ?? sp) || sp;
                descParts.push(`考试节次第${Math.min(sp, ep)}-${Math.max(sp, ep)}节`);
                lines.push(`DESCRIPTION:${this.escapeIcsText(descParts.filter(Boolean).join(' / '))}`);
                lines.push('END:VEVENT');
                return;
            }

            const startDate = new Date(`${semester.startDate}T00:00:00`);
            const endDate = new Date(`${semester.endDate}T00:00:00`);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(0, 0, 0, 0);

            for (let d = new Date(startDate); d <= endDate; d = this.addDays(d, 1)) {
                const jsDay = d.getDay();
                const weekday = jsDay === 0 ? 7 : jsDay;
                if (weekday !== Number(course.weekday)) continue;
                const teachingWeek = this.getTeachingWeekForDate(d, semester);
                if (course.parity === 'odd' && teachingWeek && teachingWeek % 2 === 0) continue;
                if (course.parity === 'even' && teachingWeek && teachingWeek % 2 === 1) continue;

                const uid = `${course.id}-${this.formatDate(d)}@selfsystem`;
                lines.push('BEGIN:VEVENT');
                lines.push(`UID:${uid}`);
                lines.push(`DTSTAMP:${dtstamp}`);
                lines.push(`SUMMARY:${this.escapeIcsText(course.name || '课程')}`);
                lines.push(`DTSTART;TZID=Asia/Shanghai:${this.formatIcsLocalDateTime(d, start)}`);
                lines.push(`DTEND;TZID=Asia/Shanghai:${this.formatIcsLocalDateTime(d, end)}`);
                if (course.location) lines.push(`LOCATION:${this.escapeIcsText(course.location)}`);
                const descParts = [];
                if (semester.academicYear || semester.term) descParts.push(`${semester.academicYear || ''} 第${semester.term || ''}学期`.trim());
                if (teachingWeek) descParts.push(`教学周第${teachingWeek}周`);
                descParts.push(`第${Number(course.periodIndex) || 1}节`);
                lines.push(`DESCRIPTION:${this.escapeIcsText(descParts.filter(Boolean).join(' / '))}`);
                lines.push('END:VEVENT');
            }
        });

        lines.push('END:VCALENDAR');

        const filenameBase = active ? `timetable-${active.academicYear || 'semester'}-T${active.term || ''}` : 'timetable-all';
        const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filenameBase}.ics`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        this.showTimetableSettingsFeedback('已生成 iCalendar 文件', 'success');
    }

    // 获取默认财务数据
    getDefaultFinanceData() {
        return {
            bankAccounts: [
                {
                    id: 1,
                    name: '工资卡',
                    bank: '招商银行',
                    balance: 50000,
                    accountNumber: '621483xxxxxxxx1234'
                },
                {
                    id: 2,
                    name: '储蓄卡',
                    bank: '工商银行',
                    balance: 20000,
                    accountNumber: '622202xxxxxxxx5678'
                }
            ],
            investments: [
                {
                    id: 1,
                    name: '股票投资',
                    type: 'stock',
                    purchasePrice: 30000,
                    currentValue: 35000,
                    purchaseDate: '2023-01-15'
                },
                {
                    id: 2,
                    name: '基金投资',
                    type: 'fund',
                    purchasePrice: 15000,
                    currentValue: 16500,
                    purchaseDate: '2023-03-20'
                }
            ],
            fixedAssets: [
                {
                    id: 1,
                    name: '住房',
                    type: 'real_estate',
                    value: 2000000,
                    purchaseDate: '2020-06-10'
                },
                {
                    id: 2,
                    name: '汽车',
                    type: 'vehicle',
                    value: 150000,
                    purchaseDate: '2021-09-05'
                }
            ],
            loans: [
                {
                    id: 1,
                    name: '住房贷款',
                    type: 'mortgage',
                    totalAmount: 1500000,
                    balance: 1200000,
                    monthlyPayment: 7500,
                    interestRate: 4.2,
                    startDate: '2020-06-10',
                    endDate: '2040-06-10'
                }
            ],
            creditCards: [
                {
                    id: 1,
                    name: '招商银行信用卡',
                    bank: '招商银行',
                    balance: 3000,
                    creditLimit: 50000,
                    dueDate: 15
                }
            ],
            savingsAccounts: [
                {
                    id: 1,
                    name: '活期储蓄',
                    bank: '建设银行',
                    balance: 10000,
                    interestRate: 0.35
                }
            ],
            assetCategories: [
                { id: 1, name: '现金', icon: 'fas fa-money-bill-wave' },
                { id: 2, name: '投资', icon: 'fas fa-chart-line' },
                { id: 3, name: '固定资产', icon: 'fas fa-home' }
            ],
            transactions: [
                {
                    id: 1,
                    date: '2024-12-01',
                    type: 'income',
                    category: '工资',
                    amount: 15000,
                    description: '12月份工资'
                },
                {
                    id: 2,
                    date: '2024-12-05',
                    type: 'expense',
                    category: '餐饮',
                    amount: 800,
                    description: '餐饮支出'
                },
                {
                    id: 3,
                    date: '2024-12-10',
                    type: 'expense',
                    category: '交通',
                    amount: 500,
                    description: '交通支出'
                },
                {
                    id: 4,
                    date: '2024-12-15',
                    type: 'expense',
                    category: '房租',
                    amount: 3000,
                    description: '12月份房租'
                }
            ],
            savingsGoal: 500000,
            budget: {
                monthly: {
                    income: 15000,
                    expenses: {
                        housing: 3000,
                        food: 2000,
                        transportation: 1000,
                        entertainment: 1500,
                        utilities: 800,
                        other: 1000
                    }
                }
            }
        };
    }

    // --- 通识模块 (General Knowledge) ---

    loadOxfordState() {
        const stored = localStorage.getItem('md_oxford_state');
        const defaults = {
            file: '牛津通识读本百本纪念套装（共100册）.epub',
            lastHref: '',
            lastCfi: '',
            fontSize: 100,
            theme: 'day',
            fontFamily: 'serif',
            bookmarks: []
        };
        if (!stored) return { ...defaults };
        try {
            const parsed = JSON.parse(stored);
            const safe = parsed && typeof parsed === 'object' ? parsed : {};
            const fontSize = Number(safe.fontSize);
            const themeRaw = typeof safe.theme === 'string' ? safe.theme : '';
            const theme = themeRaw === 'night' ? 'night' : 'day';
            const ffRaw = typeof safe.fontFamily === 'string' ? safe.fontFamily : '';
            const fontFamily = ffRaw === 'sans' ? 'sans' : 'serif';
            const bookmarks = Array.isArray(safe.bookmarks) ? safe.bookmarks : [];
            return {
                file: typeof safe.file === 'string' && safe.file.trim() ? safe.file.trim() : defaults.file,
                lastHref: typeof safe.lastHref === 'string' ? safe.lastHref : '',
                lastCfi: typeof safe.lastCfi === 'string' ? safe.lastCfi : '',
                fontSize: Number.isFinite(fontSize) ? Math.max(80, Math.min(180, Math.round(fontSize))) : defaults.fontSize,
                theme,
                fontFamily,
                bookmarks: bookmarks.filter(b => b && typeof b === 'object')
            };
        } catch {
            return { ...defaults };
        }
    }

    saveOxfordState() {
        try {
            localStorage.setItem('md_oxford_state', JSON.stringify(this.oxfordState || {}));
        } catch {
        }
    }

    initOxfordModule() {
        if (this.oxfordEventsBound) return;
        this.oxfordEventsBound = true;

        const openBtn = document.getElementById('oxfordOpenDefaultBtn');
        const pickBtn = document.getElementById('oxfordPickFileBtn');
        const fileInput = document.getElementById('oxfordFileInput');
        const setUrlBtn = document.getElementById('oxfordSetUrlBtn');
        const prevBtn = document.getElementById('oxfordPrevBtn');
        const nextBtn = document.getElementById('oxfordNextBtn');
        const fontDownBtn = document.getElementById('oxfordFontDownBtn');
        const fontUpBtn = document.getElementById('oxfordFontUpBtn');
        const fontFamilyBtn = document.getElementById('oxfordFontFamilyBtn');
        const themeBtn = document.getElementById('oxfordThemeBtn');
        const bookmarkBtn = document.getElementById('oxfordBookmarkBtn');
        const exportBtn = document.getElementById('oxfordExportChapterBtn');
        const resumeBtn = document.getElementById('oxfordResumeBtn');
        const searchInput = document.getElementById('oxfordSearchInput');
        const navEl = document.getElementById('oxfordNav');
        const bookmarksEl = document.getElementById('oxfordBookmarks');

        this.syncOxfordAssetLinks();
        openBtn?.addEventListener('click', () => this.openOxfordDefaultEpub());
        pickBtn?.addEventListener('click', () => fileInput?.click());
        setUrlBtn?.addEventListener('click', () => this.promptSetOxfordUrl());
        fileInput?.addEventListener('change', () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            fileInput.value = '';
            this.openOxfordEpubFromFile(file);
        });
        prevBtn?.addEventListener('click', () => this.oxfordRendition?.prev?.());
        nextBtn?.addEventListener('click', () => this.oxfordRendition?.next?.());
        resumeBtn?.addEventListener('click', () => this.resumeOxfordReading());

        fontDownBtn?.addEventListener('click', () => this.adjustOxfordFontSize(-10));
        fontUpBtn?.addEventListener('click', () => this.adjustOxfordFontSize(10));
        fontFamilyBtn?.addEventListener('click', () => this.toggleOxfordFontFamily());
        themeBtn?.addEventListener('click', () => this.toggleOxfordTheme());
        bookmarkBtn?.addEventListener('click', () => this.toggleOxfordBookmark());
        exportBtn?.addEventListener('click', (e) => this.exportOxfordCurrentChapter(e));

        searchInput?.addEventListener('input', () => {
            this.renderOxfordNav(String(searchInput.value || '').trim());
        });

        navEl?.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('button.oxford-nav-item');
            if (!btn) return;
            const href = btn.getAttribute('data-href') || '';
            if (!href) return;
            this.displayOxfordHref(href);
        });

        bookmarksEl?.addEventListener('click', (e) => {
            const del = e.target?.closest?.('[data-oxford-bookmark-del]');
            if (del) {
                const idx = Number(del.getAttribute('data-oxford-bookmark-del'));
                if (Number.isFinite(idx)) this.deleteOxfordBookmark(idx);
                return;
            }
            const item = e.target?.closest?.('[data-oxford-bookmark-jump]');
            if (!item) return;
            const cfi = item.getAttribute('data-oxford-bookmark-jump') || '';
            if (!cfi) return;
            this.oxfordRendition?.display?.(cfi);
        });
    }

    ensureOxfordAutoload() {
        if (this.oxfordRendition && this.oxfordBook) {
            this.renderOxfordNav(String(document.getElementById('oxfordSearchInput')?.value || '').trim());
            this.resumeOxfordReading();
            return;
        }
        if (this.oxfordAutoloading) return;
        this.oxfordAutoloading = true;
        const navEl = document.getElementById('oxfordNav');
        if (navEl) navEl.innerHTML = `<div class="oxford-empty">目录加载中…</div>`;
        Promise.resolve(this.openOxfordDefaultEpub())
            .catch(() => {
            })
            .finally(() => {
                this.oxfordAutoloading = false;
            });
    }

    setOxfordStatus(text) {
        const hint = document.getElementById('oxfordStatusHint');
        if (hint) hint.textContent = String(text || '');
    }

    normalizeOxfordHref(href) {
        const raw = String(href || '').trim();
        if (!raw) return '';
        return raw.replace(/^\.\/+/, '').replace(/#.*$/, '').trim();
    }

    buildOxfordNavGroups(toc) {
        const safeToc = Array.isArray(toc) ? toc : [];
        const groups = [];

        const flatten = (items, depth = 0) => {
            const out = [];
            (Array.isArray(items) ? items : []).forEach((it) => {
                const label = String(it?.label || '').trim();
                const href = String(it?.href || '').trim();
                if (label && href) out.push({ label, href, depth });
                const sub = it?.subitems || it?.subItems || it?.children;
                if (sub && Array.isArray(sub) && sub.length) {
                    out.push(...flatten(sub, depth + 1));
                }
            });
            return out;
        };

        safeToc.forEach((top) => {
            const title = String(top?.label || '').trim();
            const topHref = String(top?.href || '').trim();
            const sub = top?.subitems || top?.subItems || top?.children;
            if (sub && Array.isArray(sub) && sub.length) {
                groups.push({
                    title: title || '目录',
                    items: flatten(sub, 0)
                });
                return;
            }
            if (title && topHref) {
                groups.push({
                    title: '目录',
                    items: [{ label: title, href: topHref, depth: 0 }]
                });
            }
        });

        if (!groups.length) {
            const flat = flatten(safeToc, 0);
            if (flat.length) groups.push({ title: '目录', items: flat });
        }

        return groups;
    }

    renderOxfordNav(filterText = '') {
        const navEl = document.getElementById('oxfordNav');
        if (!navEl) return;
        const q = String(filterText || '').trim().toLowerCase();
        const active = this.normalizeOxfordHref(this.oxfordActiveHref || this.oxfordState?.lastHref || '');
        const groups = Array.isArray(this.oxfordNavGroups) ? this.oxfordNavGroups : [];
        if (!groups.length) {
            navEl.innerHTML = `<div class="oxford-empty">目录加载中…</div>`;
            return;
        }

        const html = groups.map((g) => {
            const items = (Array.isArray(g.items) ? g.items : []).filter((it) => {
                if (!q) return true;
                return String(it.label || '').toLowerCase().includes(q);
            });
            if (!items.length) return '';
            const list = items.map((it) => {
                const normalized = this.normalizeOxfordHref(it.href);
                const isActive = active && normalized && (active === normalized || active.endsWith(normalized) || normalized.endsWith(active));
                const prefix = it.depth > 0 ? `${'—'.repeat(Math.min(it.depth, 3))} ` : '';
                return `
                    <button type="button" class="oxford-nav-item${isActive ? ' active' : ''}" data-href="${it.href.replace(/"/g, '&quot;')}">
                        ${prefix}${String(it.label || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                    </button>
                `;
            }).join('');
            return `
                <div class="oxford-nav-group">
                    <div class="oxford-nav-group-title">${String(g.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                    <div class="oxford-nav-list">${list}</div>
                </div>
            `;
        }).join('');

        navEl.innerHTML = html || `<div class="oxford-empty">未找到匹配的目录项</div>`;
    }

    adjustOxfordFontSize(delta) {
        const next = Math.max(80, Math.min(180, Math.round((Number(this.oxfordState?.fontSize) || 100) + Number(delta || 0))));
        this.oxfordState.fontSize = next;
        this.saveOxfordState();
        if (this.oxfordRendition?.themes?.fontSize) {
            this.oxfordRendition.themes.fontSize(`${next}%`);
        }
    }

    applyOxfordThemeAndFont() {
        const rendition = this.oxfordRendition;
        if (!rendition?.themes) return;

        const isNight = this.oxfordState?.theme === 'night';
        const isSans = this.oxfordState?.fontFamily === 'sans';
        const fontFamily = isSans
            ? `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif`
            : `"Songti SC","STSong","SimSun",Georgia,"Times New Roman",serif`;

        const dayTheme = {
            body: {
                background: '#ffffff',
                color: '#0f172a',
                fontFamily
            },
            a: { color: '#1d4ed8' }
        };
        const nightTheme = {
            body: {
                background: '#0b1220',
                color: '#e5e7eb',
                fontFamily
            },
            a: { color: '#93c5fd' }
        };

        rendition.themes.register('day', dayTheme);
        rendition.themes.register('night', nightTheme);
        rendition.themes.select(isNight ? 'night' : 'day');

        const view = document.getElementById('gkOxfordView');
        if (view) {
            view.setAttribute('data-oxford-theme', isNight ? 'night' : 'day');
            view.setAttribute('data-oxford-font', isSans ? 'sans' : 'serif');
        }

        const btn = document.getElementById('oxfordThemeBtn');
        if (btn) btn.innerHTML = isNight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';

        const ffBtn = document.getElementById('oxfordFontFamilyBtn');
        if (ffBtn) {
            ffBtn.innerHTML = isSans ? '<i class="fas fa-font"></i> 黑' : '<i class="fas fa-font"></i> 宋';
            ffBtn.setAttribute('aria-label', isSans ? '当前字体：无衬线（黑体）' : '当前字体：衬线（宋体）');
        }
    }

    toggleOxfordTheme() {
        this.oxfordState.theme = this.oxfordState?.theme === 'night' ? 'day' : 'night';
        this.saveOxfordState();
        this.applyOxfordThemeAndFont();
    }

    toggleOxfordFontFamily() {
        this.oxfordState.fontFamily = this.oxfordState?.fontFamily === 'sans' ? 'serif' : 'sans';
        this.saveOxfordState();
        this.applyOxfordThemeAndFont();
    }

    getOxfordCurrentCfi() {
        const cfi = String(this.oxfordState?.lastCfi || '').trim();
        if (cfi) return cfi;
        const loc = this.oxfordRendition?.currentLocation?.();
        const startCfi = loc?.start?.cfi ? String(loc.start.cfi) : '';
        return startCfi.trim();
    }

    getOxfordBookmarkLabel() {
        const meta = String(document.getElementById('oxfordBookMeta')?.textContent || '').trim();
        const cfi = this.getOxfordCurrentCfi();
        const href = String(this.oxfordState?.lastHref || '').trim();
        const t = meta || '书签';
        if (href) return `${t} · ${href}`;
        if (cfi) return `${t} · 位置`;
        return t;
    }

    hasOxfordBookmark(cfi) {
        const list = Array.isArray(this.oxfordState?.bookmarks) ? this.oxfordState.bookmarks : [];
        return list.some(b => String(b?.cfi || '').trim() === String(cfi || '').trim());
    }

    toggleOxfordBookmark() {
        const cfi = this.getOxfordCurrentCfi();
        if (!cfi) {
            this.setOxfordStatus('无法添加书签：当前位置不可用');
            return;
        }
        const list = Array.isArray(this.oxfordState?.bookmarks) ? this.oxfordState.bookmarks.slice() : [];
        const idx = list.findIndex(b => String(b?.cfi || '').trim() === cfi);
        if (idx >= 0) {
            list.splice(idx, 1);
        } else {
            list.unshift({
                cfi,
                label: this.getOxfordBookmarkLabel(),
                createdAt: new Date().toISOString()
            });
        }
        this.oxfordState.bookmarks = list.slice(0, 80);
        this.saveOxfordState();
        this.renderOxfordBookmarks();
        this.updateOxfordBookmarkButton();
    }

    deleteOxfordBookmark(index) {
        const idx = Number(index);
        const list = Array.isArray(this.oxfordState?.bookmarks) ? this.oxfordState.bookmarks.slice() : [];
        if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) return;
        list.splice(idx, 1);
        this.oxfordState.bookmarks = list;
        this.saveOxfordState();
        this.renderOxfordBookmarks();
        this.updateOxfordBookmarkButton();
    }

    updateOxfordBookmarkButton() {
        const btn = document.getElementById('oxfordBookmarkBtn');
        if (!btn) return;
        const cfi = this.getOxfordCurrentCfi();
        const has = cfi ? this.hasOxfordBookmark(cfi) : false;
        btn.innerHTML = has ? '<i class="fas fa-bookmark"></i>' : '<i class="far fa-bookmark"></i>';
    }

    renderOxfordBookmarks() {
        const el = document.getElementById('oxfordBookmarks');
        if (!el) return;
        const list = Array.isArray(this.oxfordState?.bookmarks) ? this.oxfordState.bookmarks : [];
        if (!list.length) {
            el.innerHTML = '';
            return;
        }
        const items = list.slice(0, 12).map((b, idx) => {
            const label = String(b?.label || '').trim() || '书签';
            const cfi = String(b?.cfi || '').trim();
            const safeLabel = label.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeCfi = cfi.replace(/"/g, '&quot;');
            return `
                <div class="oxford-bookmark-item">
                    <button type="button" class="oxford-bookmark-jump" data-oxford-bookmark-jump="${safeCfi}">${safeLabel}</button>
                    <button type="button" class="oxford-bookmark-del" data-oxford-bookmark-del="${idx}" aria-label="删除书签">
                        <i class="fas fa-xmark"></i>
                    </button>
                </div>
            `;
        }).join('');
        el.innerHTML = `
            <div class="oxford-bookmarks-header">
                <div class="oxford-bookmarks-title">书签</div>
            </div>
            <div class="oxford-bookmarks-list">${items}</div>
        `;
    }

    async exportOxfordCurrentChapter(e) {
        const book = this.oxfordBook;
        const rendition = this.oxfordRendition;
        if (!book || !rendition) {
            this.setOxfordStatus('无法导出：书籍未加载');
            return;
        }
        const href = String(this.oxfordState?.lastHref || '').trim();
        if (!href) {
            this.setOxfordStatus('无法导出：当前章节不可用');
            return;
        }
        try {
            let html = '';
            let text = '';
            const contents = typeof rendition.getContents === 'function' ? rendition.getContents() : [];
            const currentDoc = Array.isArray(contents) ? contents.find(c => c?.document)?.document : null;
            if (currentDoc?.documentElement?.outerHTML) {
                html = currentDoc.documentElement.outerHTML;
                text = String(currentDoc.body?.innerText || currentDoc.body?.textContent || '').trim();
            }
            if (!html) {
                const section = typeof book.section === 'function' ? book.section(href) : null;
                if (section?.load) {
                    await section.load(book.load.bind(book));
                    const doc = section.document;
                    if (doc?.documentElement?.outerHTML) {
                        html = doc.documentElement.outerHTML;
                        text = String(doc.body?.innerText || doc.body?.textContent || '').trim();
                    }
                }
            }
            if (!html) {
                const loaded = await book.load(href);
                if (typeof loaded === 'string') html = loaded;
                else if (loaded?.documentElement?.outerHTML) html = loaded.documentElement.outerHTML;
                else if (loaded?.outerHTML) html = loaded.outerHTML;
                else html = String(loaded || '');
            }
            if (!text && html) {
                try {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    text = String(doc.body?.innerText || doc.body?.textContent || '').trim();
                } catch {
                }
            }

            const wantText = Boolean(e?.shiftKey);
            const blob = wantText
                ? new Blob([text || ''], { type: 'text/plain;charset=utf-8' })
                : new Blob([html], { type: 'text/html;charset=utf-8' });
            const a = document.createElement('a');
            const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
            a.href = URL.createObjectURL(blob);
            a.download = wantText ? `oxford-chapter-${stamp}.txt` : `oxford-chapter-${stamp}.html`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1500);
            this.setOxfordStatus(wantText ? '已导出当前章节 TXT' : '已导出当前章节 HTML（Shift 可导出 TXT）');
        } catch (e) {
            this.setOxfordStatus('导出失败：无法读取章节内容');
        }
    }

    displayOxfordHref(href) {
        if (!href) return;
        this.oxfordRendition?.display?.(href);
        this.oxfordActiveHref = href;
        this.oxfordState.lastHref = href;
        this.saveOxfordState();
        this.renderOxfordNav(String(document.getElementById('oxfordSearchInput')?.value || '').trim());
    }

    resumeOxfordReading() {
        if (!this.oxfordRendition?.display) return;
        const cfi = String(this.oxfordState?.lastCfi || '').trim();
        const href = String(this.oxfordState?.lastHref || '').trim();
        if (cfi) {
            this.oxfordRendition.display(cfi).catch?.(() => {
                if (href) this.oxfordRendition.display(href);
            });
            return;
        }
        if (href) this.oxfordRendition.display(href);
    }

    async openOxfordDefaultEpub() {
        const source = this.getOxfordSourceUrl();
        const overrides = this.loadAssetOverrides();
        const hasOverride = typeof overrides.oxfordEpubUrl === 'string' && overrides.oxfordEpubUrl.trim();
        if (this.isHostedEnvironment() && !hasOverride && source === encodeURIComponent(this.getDefaultOxfordFileName())) {
            this.setOxfordStatus('默认 EPUB 过大：Cloudflare Pages 单文件限制 25MiB，建议上传到 Cloudflare R2 后用「设置链接」');
            const navEl = document.getElementById('oxfordNav');
            if (navEl) navEl.innerHTML = `<div class="oxford-empty">未加载：请先设置 EPUB 直链或导入本地文件</div>`;
            const metaEl = document.getElementById('oxfordBookMeta');
            if (metaEl) metaEl.textContent = '未加载';
            return false;
        }
        const ok = await this.openOxfordEpub(source);
        if (!ok) {
            this.setOxfordStatus('EPUB 原书未部署：可点击「设置链接」填入直链，或点击「选择EPUB」导入本地文件');
            const navEl = document.getElementById('oxfordNav');
            if (navEl) navEl.innerHTML = `<div class="oxford-empty">未加载：请先设置 EPUB 直链或导入本地文件</div>`;
            const metaEl = document.getElementById('oxfordBookMeta');
            if (metaEl) metaEl.textContent = '未加载';
        }
        return ok;
    }

    async openOxfordEpubFromFile(file) {
        if (typeof window === 'undefined' || typeof window.ePub !== 'function') {
            this.setOxfordStatus('EPUB 阅读组件未加载，请检查网络或刷新页面');
            return false;
        }
        if (!file) return false;
        this.setOxfordStatus('正在读取本地 EPUB…');
        try {
            const buf = await file.arrayBuffer();
            const ok = await this.openOxfordEpub(buf, { fileName: file.name });
            if (!ok) this.setOxfordStatus('加载失败：无法打开 EPUB');
            return ok;
        } catch {
            this.setOxfordStatus('加载失败：无法读取 EPUB');
            return false;
        }
    }

    async fetchOxfordServerOxfordStatus() {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 3000);
            const res = await fetch('/api/oxford/status', { signal: ctrl.signal, cache: 'no-store' });
            clearTimeout(timer);
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

    async ensureOxfordServerExtracted() {
        const started = Date.now();
        const maxWaitMs = 120000;

        let st = await this.fetchOxfordServerOxfordStatus();
        if (st?.ready) return st;

        try {
            await fetch('/api/oxford/extract', { method: 'POST' });
        } catch {
        }

        while (Date.now() - started < maxWaitMs) {
            await new Promise(r => setTimeout(r, 900));
            st = await this.fetchOxfordServerOxfordStatus();
            if (st?.ready) return st;
            if (st?.error) return st;
        }
        return st;
    }

    async openOxfordEpub(source, options = {}) {
        if (typeof window === 'undefined' || typeof window.ePub !== 'function') {
            this.setOxfordStatus('EPUB 阅读组件未加载，请检查网络或刷新页面');
            return false;
        }

        const container = document.getElementById('oxfordRendition');
        if (!container) return false;

        try {
            this.oxfordRendition?.destroy?.();
        } catch {
        }
        try {
            this.oxfordBook?.destroy?.();
        } catch {
        }
        try {
            if (this.oxfordResizeHandler) window.removeEventListener('resize', this.oxfordResizeHandler);
        } catch {
        }

        container.innerHTML = '';

        try {
            const book = window.ePub(source);
            this.oxfordBook = book;
            const rendition = book.renderTo('oxfordRendition', {
                width: '100%',
                height: '100%',
                spread: 'none',
                flow: 'paginated'
            });
            this.oxfordRendition = rendition;
            try {
                rendition.flow?.('paginated');
            } catch {
            }

            rendition.themes?.fontSize?.(`${Number(this.oxfordState?.fontSize) || 100}%`);
            this.applyOxfordThemeAndFont();

            rendition.on?.('relocated', (location) => {
                const href = location?.start?.href ? String(location.start.href) : '';
                const cfi = location?.start?.cfi ? String(location.start.cfi) : '';
                if (href) {
                    this.oxfordActiveHref = href;
                    this.oxfordState.lastHref = href;
                }
                if (cfi) this.oxfordState.lastCfi = cfi;
                this.saveOxfordState();
                this.renderOxfordNav(String(document.getElementById('oxfordSearchInput')?.value || '').trim());
                this.updateOxfordBookmarkButton();
            });

            const metadata = await book.loaded?.metadata;
            const title = String(metadata?.title || '').trim() || '牛津通识（EPUB）';
            const metaEl = document.getElementById('oxfordBookMeta');
            if (metaEl) metaEl.textContent = title;

            const navigation = await book.loaded?.navigation;
            const toc = navigation?.toc || [];
            this.oxfordNavGroups = this.buildOxfordNavGroups(toc);
            this.renderOxfordNav('');

            const nextFileName = typeof options?.fileName === 'string' && options.fileName.trim() ? options.fileName.trim() : '';
            if (nextFileName) {
                this.oxfordState.file = nextFileName;
            } else if (typeof source === 'string') {
                this.oxfordState.file = decodeURIComponent(source);
            }
            this.saveOxfordState();

            this.renderOxfordBookmarks();
            this.updateOxfordBookmarkButton();

            const startAt = String(this.oxfordState?.lastCfi || this.oxfordState?.lastHref || '').trim();
            if (startAt) {
                try {
                    await rendition.display(startAt);
                } catch {
                    await rendition.display();
                }
            } else {
                await rendition.display();
            }

            const resizeHandler = () => {
                try {
                    this.oxfordRendition?.resize?.();
                } catch {
                }
            };
            this.oxfordResizeHandler = resizeHandler;
            try {
                window.addEventListener('resize', resizeHandler);
            } catch {
            }
            resizeHandler();

            this.setOxfordStatus('可阅读：支持目录导航/夜间模式/书签');
            return true;
        } catch (e) {
            container.innerHTML = `<div class="oxford-empty">加载失败：无法打开 EPUB</div>`;
            this.setOxfordStatus('加载失败：无法打开 EPUB');
            return false;
        }
    }

    loadGkSettings() {
        const stored = localStorage.getItem('md_gk_settings');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {}
        }
        return {
            newLimit: 10,
            reviewLimit: 50,
            lastStudyDate: ''
        };
    }

    saveGkSettings() {
        localStorage.setItem('md_gk_settings', JSON.stringify(this.gkSettings));
    }

    openGkSettingsModal() {
        const modal = document.getElementById('gkSettingsModal');
        const newLimitEl = document.getElementById('gkNewLimit');
        const reviewLimitEl = document.getElementById('gkReviewLimit');
        if (!modal || !newLimitEl || !reviewLimitEl) return;
        modal.classList.add('active');
        newLimitEl.value = this.gkSettings.newLimit || 10;
        reviewLimitEl.value = this.gkSettings.reviewLimit || 50;
    }

    saveGkSettingsFromModal() {
        const modal = document.getElementById('gkSettingsModal');
        const newLimitEl = document.getElementById('gkNewLimit');
        const reviewLimitEl = document.getElementById('gkReviewLimit');
        if (!modal || !newLimitEl || !reviewLimitEl) return;
        const newLimit = parseInt(newLimitEl.value, 10);
        const reviewLimit = parseInt(reviewLimitEl.value, 10);
        
        this.gkSettings.newLimit = isNaN(newLimit) ? 10 : newLimit;
        this.gkSettings.reviewLimit = isNaN(reviewLimit) ? 50 : reviewLimit;
        
        this.saveGkSettings();
        modal.classList.remove('active');
        alert('设置已保存');
    }

    openGkManualAddModal() {
        const modal = document.getElementById('gkManualAddModal');
        if (!modal) return;
        const fields = [
            'gkManualContent',
            'gkManualAuthor',
            'gkManualSource',
            'gkManualMeaning',
            'gkBulkInput'
        ];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        modal.classList.add('active');
    }

    addGkQuoteFromModal() {
        const contentEl = document.getElementById('gkManualContent');
        const authorEl = document.getElementById('gkManualAuthor');
        const sourceEl = document.getElementById('gkManualSource');
        const meaningEl = document.getElementById('gkManualMeaning');
        const modal = document.getElementById('gkManualAddModal');
        if (!contentEl || !authorEl || !sourceEl || !meaningEl || !modal) return;

        const content = (contentEl.value || '').trim();
        if (!content) {
            alert('请填写名句原文');
            return;
        }

        const exists = this.gkQuotes.some(q => (q.content || '').trim() === content);
        if (exists) {
            alert('这条名句已存在');
            return;
        }

        this.gkQuotes.unshift({
            id: 'gk_' + Date.now() + Math.random().toString(36).slice(2, 7),
            content,
            author: (authorEl.value || '').trim() || '佚名',
            source: (sourceEl.value || '').trim(),
            meaning: (meaningEl.value || '').trim(),
            nextReview: Date.now(),
            interval: 0,
            level: 0
        });

        this.saveGkQuotes();
        this.renderGeneralKnowledgeQuotes();
        modal.classList.remove('active');
        alert('已添加');
    }

    addGkQuotesBulkFromModal() {
        const bulkEl = document.getElementById('gkBulkInput');
        if (!bulkEl) return;
        const raw = (bulkEl.value || '').trim();
        if (!raw) return;

        const normalizeContent = (s) => {
            return (s || '')
                .replace(/^\s*[\d一二三四五六七八九十]+[\.、\)\]]\s*/g, '')
                .replace(/^\s*[（(][\d一二三四五六七八九十]+[）)]\s*/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
        let addedCount = 0;

        lines.forEach(line => {
            const parts = line.split('|').map(p => (p || '').trim());
            const content = normalizeContent(parts[0]);
            if (!content) return;

            const exists = this.gkQuotes.some(q => (q.content || '').trim() === content);
            if (exists) return;

            this.gkQuotes.unshift({
                id: 'gk_' + Date.now() + Math.random().toString(36).slice(2, 7),
                content,
                author: parts[1] ? parts[1] : '佚名',
                source: parts[2] ? parts[2] : '',
                meaning: parts[3] ? parts[3] : '',
                nextReview: Date.now(),
                interval: 0,
                level: 0
            });
            addedCount++;
        });

        bulkEl.value = '';
        this.saveGkQuotes();
        this.renderGeneralKnowledgeQuotes();
        alert(`已添加 ${addedCount} 条`);
    }

    loadGkQuotes() {
        // Try to load from API first if online
        fetch('/api/gk/quotes')
            .then(res => res.json())
            .then(data => {
                if (data.quotes && Array.isArray(data.quotes) && data.quotes.length > 0) {
                    this.gkQuotes = data.quotes;
                    this.renderGeneralKnowledgeQuotes();
                    this.updateGkStats();
                    localStorage.setItem('md_gk_quotes', JSON.stringify(this.gkQuotes));
                }
            })
            .catch(err => console.log('GK Quotes API load failed, using local storage', err));

        const stored = localStorage.getItem('md_gk_quotes');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                console.error('Failed to parse GK quotes', e);
            }
        }
        // 默认名句数据 (Default Sample)
        return [
            { id: 'gk_1', content: '学而时习之，不亦说乎？', author: '孔子', source: '论语·学而', meaning: '学习了知识而按时温习它，不也是很高兴的吗？', nextReview: Date.now(), interval: 0, ease: 2.5, level: 0 },
            { id: 'gk_2', content: '温故而知新，可以为师矣。', author: '孔子', source: '论语·为政', meaning: '温习旧的知识，从而得到新的理解和体会，就可以凭借这个做老师了。', nextReview: Date.now(), interval: 0, ease: 2.5, level: 0 },
            { id: 'gk_3', content: '三人行，必有我师焉。', author: '孔子', source: '论语·述而', meaning: '几个人在一起走路，其中一定有值得我学习的人。', nextReview: Date.now(), interval: 0, ease: 2.5, level: 0 }
        ];
    }

    saveGkQuotes() {
        localStorage.setItem('md_gk_quotes', JSON.stringify(this.gkQuotes));
        this.updateGkStats();
    }

    initGeneralKnowledgeModule() {
        // 绑定事件已经在 index.html onclick 中处理，这里做初始化渲染
        this.renderGeneralKnowledgeQuotes();
        this.updateGkStats();
    }

    showGeneralKnowledgeHome() {
        const moduleEl = document.getElementById('generalKnowledgeModule');
        if (!moduleEl) return;
        moduleEl.querySelectorAll('.gk-subview').forEach(v => v.classList.remove('active'));
        const home = moduleEl.querySelector('#gkHomeView');
        if (home) home.classList.add('active');
    }

    showGeneralKnowledgeSubmodule(submodule) {
        const target = String(submodule || '');
        if (!target) return;
        const moduleEl = document.getElementById('generalKnowledgeModule');
        if (!moduleEl) return;
        moduleEl.querySelectorAll('.gk-subview').forEach(v => v.classList.remove('active'));

        if (target === 'dictionary') {
            const view = moduleEl.querySelector('#gkDictionaryView');
            if (view) view.classList.add('active');
            this.switchGeneralKnowledgeTab('list');
            this.renderGeneralKnowledgeQuotes();
            this.updateGkStats();
            return;
        }

        if (target === 'oxford') {
            const view = moduleEl.querySelector('#gkOxfordView');
            if (view) view.classList.add('active');
            this.initOxfordModule();
            this.renderOxfordNav(String(document.getElementById('oxfordSearchInput')?.value || '').trim());
            this.ensureOxfordAutoload();
            return;
        }

        this.showGeneralKnowledgeHome();
    }

    switchGeneralKnowledgeTab(tabName) {
        const container = document.getElementById('gkDictionaryView');
        if (!container) return;

        // Update tab buttons
        container.querySelectorAll('.pwa-tab').forEach(t => {
            if (t.dataset.tab.startsWith('quotes-')) {
                t.classList.toggle('active', t.dataset.tab === `quotes-${tabName}`);
            } else {
                t.classList.toggle('active', t.dataset.tab === tabName);
            }
        });

        // Hide all views
        container.querySelectorAll('.gk-view').forEach(v => v.style.display = 'none');
        container.querySelectorAll('.gk-view').forEach(v => v.classList.remove('active'));

        // Show selected view
        const view = container.querySelector(`#gk-view-${tabName}`);
        if (view) {
            view.style.display = 'block';
            setTimeout(() => view.classList.add('active'), 10);
            
            if (tabName === 'recite') {
                this.startRecitation();
            } else if (tabName === 'stats') {
                this.updateGkStats();
            } else if (tabName === 'pdf') {
                this.initPDFViewer();
            }
        }
    }

    renderGeneralKnowledgeQuotes() {
        const grid = document.getElementById('gkQuotesGrid');
        if (!grid) return;

        const searchTerm = (document.getElementById('gkSearchInput')?.value || '').toLowerCase();
        const filtered = this.gkQuotes.filter(q => 
            q.content.toLowerCase().includes(searchTerm) || 
            q.author.toLowerCase().includes(searchTerm)
        );

        grid.innerHTML = filtered.map(q => `
            <div class="gk-quote-card">
                <div class="gk-quote-text">"${q.content}"</div>
                <div class="gk-quote-info">
                    <span class="gk-quote-author">${q.author} · ${q.source || '佚名'}</span>
                </div>
                ${q.meaning ? `<div class="gk-quote-meaning">${q.meaning}</div>` : ''}
            </div>
        `).join('');
        
        // Update stats in module card
        const countEl = document.getElementById('generalKnowledgeCount');
        if (countEl) countEl.textContent = this.gkQuotes.length;
        
        const dueCount = this.gkQuotes.filter(q => q.nextReview <= Date.now()).length;
        const dueEl = document.getElementById('generalKnowledgeDueCount');
        if (dueEl) dueEl.textContent = dueCount;
    }
    
    filterQuotes() {
        this.renderGeneralKnowledgeQuotes();
    }

    // --- Recitation Logic (Simple SRS) ---
    startRecitation() {
        const dueCards = this.gkQuotes.filter(q => q.nextReview <= Date.now());
        const container = document.getElementById('gkReciteContainer');
        const emptyState = document.getElementById('gkReciteEmpty');
        
        if (dueCards.length === 0) {
            container.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        container.style.display = 'block';
        emptyState.style.display = 'none';
        
        this.currentReciteCard = dueCards[0];
        this.renderReciteCard();
    }

    renderReciteCard() {
        if (!this.currentReciteCard) return;
        const card = document.querySelector('.gk-recite-card');
        if (card) {
            card.classList.remove('flipped');
            // Front
            card.querySelector('.gk-card-front .gk-card-content h3').textContent = this.currentReciteCard.content;
            card.querySelector('.gk-card-front .gk-card-content p').textContent = '点击查看出处与释义';
            
            // Back
            card.querySelector('.gk-card-back .gk-card-content h3').innerHTML = `
                ${this.currentReciteCard.author} · ${this.currentReciteCard.source}<br>
                <span style="font-size: 0.9rem; font-weight: normal; color: #666; display: block; margin-top: 1rem;">
                    ${this.currentReciteCard.meaning || ''}
                </span>
            `;
        }
    }

    rateRecitation(quality) {
        if (!this.currentReciteCard) return;
        
        // Track counts
        if ((this.currentReciteCard.level || 0) === 0) {
            this.gkSettings.todayNewCount = (this.gkSettings.todayNewCount || 0) + 1;
        } else {
            this.gkSettings.todayReviewCount = (this.gkSettings.todayReviewCount || 0) + 1;
        }
        this.saveGkSettings();
        
        // Simple SRS Update
        const card = this.currentReciteCard;
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        if (quality < 3) {
            card.interval = 1;
            card.level = 0;
        } else {
            card.level = (card.level || 0) + 1;
            // Interval calculation: 1, 3, 7, 15, 30...
            const intervals = [1, 3, 7, 15, 30, 60, 90];
            card.interval = intervals[Math.min(card.level - 1, intervals.length - 1)] || 30;
        }

        card.nextReview = now + (card.interval * oneDay);
        
        this.saveGkQuotes();
        
        // Move to next card
        this.startRecitation();
    }

    updateGkStats() {
        const total = this.gkQuotes.length;
        const mastered = this.gkQuotes.filter(q => (q.level || 0) >= 5).length;
        
        const totalEl = document.getElementById('gkStatTotal');
        if (totalEl) totalEl.textContent = total;
        const masteredEl = document.getElementById('gkStatMastered');
        if (masteredEl) masteredEl.textContent = mastered;
        
        // Also update module card stats
        const countEl = document.getElementById('generalKnowledgeCount');
        if (countEl) countEl.textContent = total;
        
        const dueCount = this.gkQuotes.filter(q => q.nextReview <= Date.now()).length;
        const dueEl = document.getElementById('generalKnowledgeDueCount');
        if (dueEl) dueEl.textContent = dueCount;

        const gkModuleCount = document.getElementById('gkModuleCountStat');
        if (gkModuleCount) gkModuleCount.textContent = `名句库: ${total}`;
        const gkModuleDue = document.getElementById('gkModuleDueStat');
        if (gkModuleDue) gkModuleDue.textContent = `待复习: ${dueCount}`;
    }

    // --- PDF Import ---
    openImportQuotesModal() {
        document.getElementById('gkImportModal').classList.add('active');
        document.getElementById('gkImportPreview').value = '';
        document.getElementById('gkPdfInput').value = '';
    }

    async parsePdfText() {
        const fileInput = document.getElementById('gkPdfInput');
        const file = fileInput.files[0];
        if (!file) {
            alert('请先选择 PDF 文件');
            return;
        }

        try {
            if (!window.pdfjsLib || !window.pdfjsLib.getDocument) {
                alert('PDF 解析组件未加载，请稍后重试或刷新页面');
                return;
            }
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            let fullText = '';
            
            // Limit pages to avoid freezing
            const maxPages = Math.min(pdf.numPages, 30); 
            
            for (let i = 1; i <= maxPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const items = Array.isArray(textContent.items) ? textContent.items : [];
                const lines = [];
                let currentLine = '';
                let lastY = null;

                items.forEach(item => {
                    const str = (item && typeof item.str === 'string') ? item.str : '';
                    const text = str.trim();
                    if (!text) return;

                    const y = item && item.transform && typeof item.transform[5] === 'number' ? item.transform[5] : null;
                    const hasEOL = !!(item && item.hasEOL);

                    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
                        if (currentLine.trim()) lines.push(currentLine.trim());
                        currentLine = text;
                        lastY = y;
                        return;
                    }

                    currentLine = currentLine ? (currentLine + ' ' + text) : text;
                    lastY = y;

                    if (hasEOL) {
                        if (currentLine.trim()) lines.push(currentLine.trim());
                        currentLine = '';
                        lastY = null;
                    }
                });

                if (currentLine.trim()) lines.push(currentLine.trim());
                fullText += (lines.length ? lines.join('\n') : '') + '\n\n';
            }
            
            document.getElementById('gkImportPreview').value = fullText;
        } catch (e) {
            console.error('PDF Parse Error:', e);
            alert('PDF 解析失败，请重试或手动复制文本。');
        }
    }

    processImportText() {
        const text = document.getElementById('gkImportPreview').value;
        if (!text) return;
        
        const normalizeContent = (s) => {
            return (s || '')
                .replace(/^\s*[\d一二三四五六七八九十]+[\.、\)\]]\s*/g, '')
                .replace(/^\s*[（(][\d一二三四五六七八九十]+[）)]\s*/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const splitLongLine = (line) => {
            const trimmed = (line || '').trim();
            if (trimmed.length <= 60) return [trimmed];
            const parts = trimmed.match(/[^。！？；]+[。！？；]?/g);
            const cleaned = (parts || []).map(p => p.trim()).filter(Boolean);
            return cleaned.length ? cleaned : [trimmed];
        };

        const lines = text
            .split(/\n+/)
            .flatMap(l => splitLongLine(l))
            .map(l => normalizeContent(l))
            .filter(l => l.length >= 4);

        let addedCount = 0;
        
        lines.forEach(line => {
            const exists = this.gkQuotes.some(q => (q.content || '').trim() === line);
            if (exists) return;

            let content = line;
            let author = '佚名';
            let source = '';

            const parts = line.split(/[———-]/).map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                content = parts[0];
                author = parts[1] || author;
                if (parts.length >= 3) source = parts.slice(2).join(' ');
            }
            
            this.gkQuotes.push({
                id: 'gk_' + Date.now() + Math.random().toString(36).substr(2, 5),
                content: content || line,
                author: author || '佚名',
                source: source || '',
                meaning: '',
                nextReview: Date.now(),
                interval: 0,
                level: 0
            });
            addedCount++;
        });
        
        this.saveGkQuotes();
        alert(`成功导入 ${addedCount} 条名句`);
        document.getElementById('gkImportModal').classList.remove('active');
        this.renderGeneralKnowledgeQuotes();
    }

    supportsEmbeddedPdf() {
        const ua = String(navigator.userAgent || '');
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (isIOS) return false;
        return true;
    }

    shouldUsePdfJsViewer() {
        const ready = !!window.pdfjsLib?.getDocument;
        if (!ready) return false;
        if (!this.supportsEmbeddedPdf()) return true;
        return false;
    }

    async waitForPdfJsReady(maxMs = 5000) {
        const started = Date.now();
        while (Date.now() - started < maxMs) {
            if (window.pdfjsLib?.getDocument) return true;
            await new Promise(r => setTimeout(r, 120));
        }
        return !!window.pdfjsLib?.getDocument;
    }

    async loadPdfJsDocument(url) {
        const pdfjsLib = window.pdfjsLib;
        if (!pdfjsLib?.getDocument) return null;
        const raw = String(url || '').trim();
        if (!raw) return null;
        const noHash = raw.split('#')[0];
        try {
            if (this.pdfJsLoadingTask?.destroy) {
                try {
                    await this.pdfJsLoadingTask.destroy();
                } catch {
                }
            }
        } catch {
        }

        try {
            const task = pdfjsLib.getDocument({ url: noHash });
            this.pdfJsLoadingTask = task;
            const doc = await task.promise;
            this.pdfJsDoc = doc;
            return doc;
        } catch {
            this.pdfJsDoc = null;
            return null;
        }
    }

    async renderPdfJsPage(page) {
        const viewer = document.getElementById('pdfJsViewer');
        const canvas = document.getElementById('pdfJsCanvas');
        const loading = document.getElementById('pdfJsLoading');
        if (!viewer || !canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (!this.pdfJsDoc) {
            if (loading) loading.style.display = 'block';
            const base = this.getPdfBaseUrl();
            const doc = await this.loadPdfJsDocument(base);
            if (loading) loading.style.display = 'none';
            if (!doc) {
                this.showAppStatus('PDF 原书未部署或无法读取：Cloudflare Pages 单文件限制 25MiB，建议将 PDF 上传到 Cloudflare R2 后使用「设置 PDF 直链」', 'warning', { sticky: true });
                return;
            }
        }

        const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this.pdfJsRenderToken = token;

        try {
            if (loading) loading.style.display = 'block';
            const doc = this.pdfJsDoc;
            const total = Number(doc?.numPages) || 1123;
            const safePage = Math.max(1, Math.min(Number(page) || 1, total));
            const pageObj = await doc.getPage(safePage);
            if (this.pdfJsRenderToken !== token) return;

            const baseViewport = pageObj.getViewport({ scale: 1 });
            const padding = 32;
            const width = Math.max(320, viewer.clientWidth - padding);
            const scale = Math.min(2.2, Math.max(0.8, width / baseViewport.width));
            const viewport = pageObj.getViewport({ scale });

            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;

            const renderTask = pageObj.render({ canvasContext: ctx, viewport });
            this.pdfJsActiveRenderTask = renderTask;
            await renderTask.promise;
        } catch {
            this.showAppStatus('PDF 渲染失败：请尝试点击「设置 PDF 直链」或下载后本地打开', 'warning', { sticky: true });
        } finally {
            if (loading) loading.style.display = 'none';
        }
    }

    // PDF查看器功能
    initPDFViewer() {
        this.currentPDFPage = Number.isFinite(this.currentPDFPage) ? this.currentPDFPage : 1;
        this.loadPDFBookmarks();
        this.updateBookmarkButton();

        if (!this.pdfEventsBound) {
            this.bindPDFEvents();
            this.pdfEventsBound = true;
        }
        this.generatePDFToc();
        this.syncPdfAssetLinks();

        const hint = document.getElementById('pdfUnsupportedHint');
        const pdfObject = document.getElementById('pdfObject');
        const pdfJsViewer = document.getElementById('pdfJsViewer');

        if (!this.supportsEmbeddedPdf()) {
            Promise.resolve(this.waitForPdfJsReady(6000))
                .then((ok) => {
                    const usePdfJs = ok && this.shouldUsePdfJsViewer();
                    this.pdfUseJsViewer = usePdfJs;
                    if (usePdfJs) {
                        if (hint) hint.style.display = 'none';
                        if (pdfObject) pdfObject.style.display = 'none';
                        if (pdfJsViewer) pdfJsViewer.style.display = 'flex';
                        this.renderPdfJsPage(this.currentPDFPage);
                        if (!this._pdfJsResizeBound) {
                            this._pdfJsResizeBound = () => {
                                if (this.pdfUseJsViewer) this.renderPdfJsPage(this.currentPDFPage);
                            };
                            window.addEventListener('resize', this._pdfJsResizeBound);
                        }
                        return;
                    }
                    if (hint) hint.style.display = 'block';
                    if (pdfObject) pdfObject.style.display = 'none';
                    if (pdfJsViewer) pdfJsViewer.style.display = 'none';
                    this.showAppStatus('当前设备不支持内嵌 PDF：请点击右上角打开/下载，或使用「设置 PDF 直链」', 'warning', { sticky: true });
                })
                .catch(() => {
                    if (hint) hint.style.display = 'block';
                    if (pdfObject) pdfObject.style.display = 'none';
                    if (pdfJsViewer) pdfJsViewer.style.display = 'none';
                });
            return;
        }

        const usePdfJs = this.shouldUsePdfJsViewer();
        this.pdfUseJsViewer = usePdfJs;
        if (usePdfJs) {
            if (hint) hint.style.display = 'none';
            if (pdfObject) pdfObject.style.display = 'none';
            if (pdfJsViewer) pdfJsViewer.style.display = 'flex';
            this.renderPdfJsPage(this.currentPDFPage);
            if (!this._pdfJsResizeBound) {
                this._pdfJsResizeBound = () => {
                    if (this.pdfUseJsViewer) this.renderPdfJsPage(this.currentPDFPage);
                };
                window.addEventListener('resize', this._pdfJsResizeBound);
            }
            return;
        }

        if (hint) hint.style.display = 'none';
        if (pdfObject) pdfObject.style.display = '';
        if (pdfJsViewer) pdfJsViewer.style.display = 'none';
        this.goToPage(this.currentPDFPage);
    }

    bindPDFEvents() {
        // 页面导航
        document.getElementById('pdfPrevPage')?.addEventListener('click', () => {
            const base = Number.isFinite(this.currentPDFPage) ? this.currentPDFPage : 1;
            this.goToPage(base - 1);
        });
        document.getElementById('pdfNextPage')?.addEventListener('click', () => {
            const base = Number.isFinite(this.currentPDFPage) ? this.currentPDFPage : 1;
            this.goToPage(base + 1);
        });
        
        // 页面输入
        document.getElementById('pdfPageInput')?.addEventListener('change', (e) => {
            const page = parseInt(e.target.value);
            if (page >= 1 && page <= 1123) {
                this.goToPage(page);
            }
        });
        
        // 全屏切换
        document.getElementById('pdfToggleFullscreen')?.addEventListener('click', () => this.toggleFullscreen());
        
        // 书签功能
        document.getElementById('pdfToggleBookmark')?.addEventListener('click', () => this.toggleBookmark());
        
        // 目录显示
        document.getElementById('pdfShowToc')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleToc();
        });

        const pdfPickBtn = document.getElementById('pdfPickFileBtn');
        const pdfSetUrlBtn = document.getElementById('pdfSetUrlBtn');
        const pdfOpenRawBtn = document.getElementById('pdfOpenRawBtn');
        const pdfFileInput = document.getElementById('pdfFileInput');
        this.syncPdfAssetLinks();
        pdfPickBtn?.addEventListener('click', () => pdfFileInput?.click());
        pdfSetUrlBtn?.addEventListener('click', () => this.promptSetPdfUrl());
        pdfFileInput?.addEventListener('change', () => {
            const file = pdfFileInput.files && pdfFileInput.files[0];
            if (!file) return;
            pdfFileInput.value = '';
            try {
                if (this.pdfFileObjectUrl) URL.revokeObjectURL(this.pdfFileObjectUrl);
            } catch {
            }
            try {
                this.pdfFileObjectUrl = URL.createObjectURL(file);
                this.pdfFileBaseUrl = this.pdfFileObjectUrl;
                this.syncPdfAssetLinks();
                this.currentPDFPage = 1;
                this.goToPage(1);
            } catch {
            }
        });
        pdfOpenRawBtn?.addEventListener('click', async (e) => {
            const base = this.getPdfBaseUrl();
            if (!base || base === '#') {
                e.preventDefault();
                this.promptSetPdfUrl();
                return;
            }
            pdfOpenRawBtn.setAttribute('href', base);
        });

        // 点击目录项跳转
        document.addEventListener('click', (e) => {
            const menu = this.getPdfTocMenu();
            if (!menu) return;
            if (!menu.contains(e.target)) return;
            const btn = e.target.closest('.pdf-dropdown-btn');
            if (!btn) return;
            if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;

            const action = btn.dataset.action;
            if (action === 'toggle-submenu') {
                const li = btn.closest('.pdf-dropdown-item');
                if (!li) return;
                const isOpen = li.classList.toggle('submenu-open');
                btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                if (isOpen) {
                    const firstChild = li.querySelector('.pdf-dropdown-submenu .pdf-dropdown-btn:not([disabled])');
                    if (firstChild) firstChild.focus();
                }
                return;
            }

            if (btn.dataset.page) {
                this.goToPage(parseInt(btn.dataset.page));
                this.hideToc();
            }
        });

        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('pdfTocDropdownWrap');
            const menu = this.getPdfTocMenu();
            if (!wrap || !menu) return;
            if (menu.classList.contains('open') && !wrap.contains(e.target)) {
                this.hideToc();
            }
        });
        
        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (document.getElementById('gk-view-pdf')?.style.display === 'block') {
                const base = Number.isFinite(this.currentPDFPage) ? this.currentPDFPage : 1;
                if (e.key === 'ArrowLeft') this.goToPage(base - 1);
                if (e.key === 'ArrowRight') this.goToPage(base + 1);
                if (e.key === 'f' || e.key === 'F') this.toggleFullscreen();
                if (e.key === 'Escape') {
                    this.hideToc();
                    this.exitFullscreen();
                }
            }
        });
    }

    goToPage(page) {
        const safePage = Number.isFinite(page) ? page : 1;
        page = Math.max(1, Math.min(safePage, 1123));
        this.currentPDFPage = page;
        
        // 更新页面显示
        const pdfObject = document.getElementById('pdfObject');
        const pageInput = document.getElementById('pdfPageInput');
        
        if (this.pdfUseJsViewer) {
            this.renderPdfJsPage(page);
        } else if (pdfObject) {
            const base = this.getPdfBaseUrl();
            if (!base) {
                pdfObject.setAttribute('data', 'about:blank');
                pdfObject.data = 'about:blank';
                return;
            }
            const url = `${base}#page=${page}`;
            const parent = pdfObject.parentNode;
            if (parent) {
                const cloned = pdfObject.cloneNode(true);
                cloned.setAttribute('data', url);
                cloned.data = url;
                parent.replaceChild(cloned, pdfObject);
            } else {
                pdfObject.setAttribute('data', url);
                pdfObject.data = url;
            }
        }
        
        if (pageInput) {
            pageInput.value = page;
        }
        
        // 更新书签状态
        this.updateBookmarkButton();
        this.activateTocSelection(page);
    }

    toggleFullscreen() {
        const pdfModule = document.querySelector('.pdf-module');
        if (!pdfModule) return;
        
        if (!document.fullscreenElement) {
            if (pdfModule.requestFullscreen) {
                pdfModule.requestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }

    toggleBookmark() {
        if (!this.pdfBookmarks) this.pdfBookmarks = new Set();
        
        if (this.pdfBookmarks.has(this.currentPDFPage)) {
            this.pdfBookmarks.delete(this.currentPDFPage);
        } else {
            this.pdfBookmarks.add(this.currentPDFPage);
        }
        
        this.updateBookmarkButton();
        this.savePDFBookmarks();
    }

    updateBookmarkButton() {
        const bookmarkBtn = document.getElementById('pdfToggleBookmark');
        if (!bookmarkBtn) return;
        
        const isBookmarked = this.pdfBookmarks?.has(this.currentPDFPage);
        bookmarkBtn.innerHTML = isBookmarked ? 
            '<i class="fas fa-bookmark"></i>' : 
            '<i class="far fa-bookmark"></i>';
        
        bookmarkBtn.title = isBookmarked ? '移除书签' : '添加书签';
    }

    savePDFBookmarks() {
        if (this.pdfBookmarks) {
            localStorage.setItem('pdfBookmarks', JSON.stringify(Array.from(this.pdfBookmarks)));
        }
    }

    loadPDFBookmarks() {
        try {
            const bookmarks = JSON.parse(localStorage.getItem('pdfBookmarks') || '[]');
            this.pdfBookmarks = new Set(bookmarks);
        } catch (e) {
            this.pdfBookmarks = new Set();
        }
    }

    toggleToc() {
        const btn = document.getElementById('pdfShowToc');
        if (!btn) return;
        const menu = this.getPdfTocMenu();
        if (!menu || !menu.classList.contains('open')) {
            this.showToc();
        } else {
            this.hideToc();
        }
    }

    showToc() {
        const btn = document.getElementById('pdfShowToc');
        if (!btn) return;
        const menu = this.ensurePdfTocMenu();
        if (!menu) return;
        this.positionTocMenu();
        menu.classList.add('open');
        menu.setAttribute('aria-hidden', 'false');
        if (!this._pdfTocRepositionBound) this._pdfTocRepositionBound = () => this.positionTocMenu();
        window.addEventListener('resize', this._pdfTocRepositionBound);
        btn.setAttribute('aria-expanded', 'true');
        this.activateTocSelection(this.currentPDFPage);
        const first = this.getTocFocusableItems()[0];
        if (first) first.focus();
    }

    hideToc() {
        const btn = document.getElementById('pdfShowToc');
        if (!btn) return;
        const menu = this.getPdfTocMenu();
        if (!menu) return;
        menu.classList.remove('open');
        menu.setAttribute('aria-hidden', 'true');
        if (this._pdfTocRepositionBound) window.removeEventListener('resize', this._pdfTocRepositionBound);
        btn.setAttribute('aria-expanded', 'false');
        this.clearTocActive();
        menu.remove();
        this._pdfTocMenuEl = null;
    }

    positionTocMenu() {
        const menu = this.getPdfTocMenu();
        const btn = document.getElementById('pdfShowToc');
        if (!menu || !btn) return;

        const rect = btn.getBoundingClientRect();
        const padding = 12;
        const gap = 10;

        const width = Math.min(380, window.innerWidth - padding * 2);
        const top = Math.max(padding, Math.min(rect.bottom + gap, window.innerHeight - padding - 160));
        const left = Math.max(
            padding,
            Math.min(rect.right - width, window.innerWidth - padding - width)
        );
        const maxHeight = Math.max(160, window.innerHeight - top - padding);

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.setProperty('--pdf-toc-max-height', `${maxHeight}px`);
        menu.style.width = `${width}px`;
    }

    getTocFocusableItems() {
        const menu = this.getPdfTocMenu();
        if (!menu || !menu.classList.contains('open')) return [];
        const candidates = Array.from(menu.querySelectorAll('.pdf-dropdown-btn[role="menuitem"]'));
        return candidates.filter(el => {
            if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
            if (!(el instanceof HTMLElement)) return false;
            return el.offsetParent !== null;
        });
    }

    clearTocActive() {
        const menu = this.getPdfTocMenu();
        if (!menu) return;
        menu.querySelectorAll('.pdf-dropdown-btn.is-active').forEach(el => el.classList.remove('is-active'));
    }

    activateTocSelection(page) {
        const menu = this.getPdfTocMenu();
        if (!menu) return;
        menu.querySelectorAll('.pdf-dropdown-btn.is-selected').forEach(el => el.classList.remove('is-selected'));
        if (!Number.isFinite(page)) return;
        const selected = menu.querySelector(`.pdf-dropdown-btn[data-page="${page}"]`);
        if (selected) selected.classList.add('is-selected');
    }

    handleTocKeydown(e) {
        const menu = this.getPdfTocMenu();
        if (!menu || !menu.classList.contains('open')) return;
        if (!menu.contains(e.target)) return;

        const items = this.getTocFocusableItems();
        if (items.length === 0) return;

        const currentIndex = Math.max(0, items.indexOf(document.activeElement));
        let nextIndex = currentIndex;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            nextIndex = (currentIndex + 1) % items.length;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            nextIndex = (currentIndex - 1 + items.length) % items.length;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const active = document.activeElement;
            if (active && active.classList.contains('pdf-dropdown-btn')) {
                active.click();
            }
            return;
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.hideToc();
            const btn = document.getElementById('pdfShowToc');
            if (btn) btn.focus();
            return;
        } else {
            return;
        }

        this.clearTocActive();
        const next = items[nextIndex];
        next.classList.add('is-active');
        next.focus();
        if (typeof next.scrollIntoView === 'function') next.scrollIntoView({ block: 'nearest' });
    }

    generatePDFToc() {
        const tocList = this._pdfTocMenuEl?.querySelector('#pdfTocList');
        if (!tocList) return;

        const items = [
            { page: 25, icon: 'fa-mountain', label: '1. 天地景色' },
            { page: 67, icon: 'fa-calendar', label: '2. 四时' },
            { page: 87, icon: 'fa-leaf', label: '3. 生物' },
            { page: 118, icon: 'fa-globe', label: '4. 境界' },
            { page: 127, icon: 'fa-city', label: '5. 城乡，建筑，舟车' },
            { page: 142, icon: 'fa-flag', label: '6. 国家' },
            { page: 163, icon: 'fa-users', label: '7. 人民' },
            { page: 174, icon: 'fa-landmark', label: '8. 政治' },
            { page: 222, icon: 'fa-fighter-jet', label: '9. 战争' },
            { page: 239, icon: 'fa-user', label: '10. 外貌和内心' },
            { page: 262, icon: 'fa-handshake', label: '11. 伦理' },
            { page: 278, icon: 'fa-brain', label: '12. 意志' },
            { page: 307, icon: 'fa-heart', label: '13. 感情' },
            { page: 382, icon: 'fa-lightbulb', label: '14. 智力' },
            { page: 395, icon: 'fa-graduation-cap', label: '15. 人才' },
            { page: 429, icon: 'fa-award', label: '16. 品德' },
            { page: 489, icon: 'fa-chalkboard-teacher', label: '17. 教学' },
            { page: 514, icon: 'fa-comments', label: '18. 言行' },
            { page: 533, icon: 'fa-handshake', label: '19. 社交' },
            { page: 560, icon: 'fa-tasks', label: '20. 处事' },
            { page: 596, icon: 'fa-home', label: '21. 家庭' },
            { page: 607, icon: 'fa-utensils', label: '22. 生活' },
            { page: 662, icon: 'fa-globe-americas', label: '23. 世道' },
            { page: 693, icon: 'fa-yin-yang', label: '24. 哲理' },
            { page: 736, icon: 'fa-cogs', label: '25. 生产与科技' },
            { page: 753, icon: 'fa-gavel', label: '26. 法律' },
            { page: 769, icon: 'fa-book', label: '27. 文学' },
            { page: 807, icon: 'fa-paint-brush', label: '28. 艺术' },
            { page: 822, icon: 'fa-shield-alt', label: '29. 军事' },
            { page: 841, icon: 'fa-atom', label: '30. 物性事理' }
        ];

        const renderBtn = ({ page, icon, label, disabled, action, extraAttrs }) => {
            const attrs = [];
            if (page) attrs.push(`data-page="${page}"`);
            if (action) attrs.push(`data-action="${action}"`);
            if (disabled) attrs.push('disabled aria-disabled="true"');
            if (extraAttrs) attrs.push(extraAttrs);
            return `
                <button type="button" class="pdf-dropdown-btn" role="menuitem" tabindex="-1" ${attrs.join(' ')}>
                    <i class="fas ${icon}"></i>
                    <span class="pdf-dropdown-label">${label}</span>
                </button>
            `;
        };

        const bookmarkPages = Array.from(this.pdfBookmarks || []).sort((a, b) => a - b);
        const bookmarkItemsHtml = bookmarkPages.length
            ? bookmarkPages.map(page => `
                <li class="pdf-dropdown-item" role="none">
                    ${renderBtn({ page, icon: 'fa-bookmark', label: `第 ${page} 页` })}
                </li>
            `).join('')
            : `
                <li class="pdf-dropdown-item" role="none">
                    ${renderBtn({ icon: 'fa-circle-info', label: '暂无书签', disabled: true })}
                </li>
            `;

        tocList.innerHTML = `
            <li class="pdf-dropdown-heading" role="presentation">📖 目录</li>
            ${items.map(it => `
                <li class="pdf-dropdown-item" role="none">
                    ${renderBtn({ page: it.page, icon: it.icon, label: it.label })}
                </li>
            `).join('')}
            <li class="pdf-dropdown-separator" role="separator"></li>
            <li class="pdf-dropdown-item has-submenu" role="none">
                ${renderBtn({ icon: 'fa-bookmark', label: '我的书签', action: 'toggle-submenu', extraAttrs: 'aria-haspopup="true" aria-expanded="false"' })}
                <ul class="pdf-dropdown-submenu" role="menu" aria-label="书签">
                    ${bookmarkItemsHtml}
                </ul>
            </li>
        `;

        if (!this._pdfTocKeydownBound) {
            this._pdfTocKeydownBound = (e) => this.handleTocKeydown(e);
            document.addEventListener('keydown', this._pdfTocKeydownBound);
        }
    }

    renderBookmarkItems() {
        if (!this.pdfBookmarks || this.pdfBookmarks.size === 0) {
            return '<div class="toc-empty">暂无书签</div>';
        }
        
        return Array.from(this.pdfBookmarks).map(page => `
            <div class="toc-item bookmark-item" data-page="${page}">
                <i class="fas fa-bookmark"></i>
                <span>第 ${page} 页</span>
            </div>
        `).join('');
    }

    updateBookmarkList() {
        if (this._pdfTocMenuEl && this._pdfTocMenuEl.classList.contains('open')) {
            this.generatePDFToc();
        }
    }

    getPdfTocMenu() {
        const menu = this._pdfTocMenuEl || document.getElementById('pdfTocMenu');
        if (menu instanceof HTMLElement) return menu;
        return null;
    }

    ensurePdfTocMenu() {
        const existing = this.getPdfTocMenu();
        if (existing) return existing;

        const wrap = document.getElementById('pdfTocDropdownWrap');
        if (!wrap) return null;

        const menu = document.createElement('div');
        menu.className = 'pdf-toc-menu';
        menu.id = 'pdfTocMenu';
        menu.setAttribute('aria-hidden', 'true');

        const list = document.createElement('ul');
        list.className = 'pdf-dropdown-list';
        list.id = 'pdfTocList';
        list.setAttribute('role', 'menu');
        list.setAttribute('aria-label', '目录');

        menu.appendChild(list);
        wrap.appendChild(menu);
        menu.addEventListener('mouseleave', () => this.hideToc());

        this._pdfTocMenuEl = menu;
        this.generatePDFToc();
        return menu;
    }
}



// 应用启动
document.addEventListener('DOMContentLoaded', () => {
    const app = new SelfSystem();
    
    // 全局变量以便调试
    window.selfSystem = app;
    window.app = app;

    const handleConnectivity = () => {
        if (navigator.onLine) {
            app.showAppStatus('已恢复联网', 'success');
        } else {
            app.showAppStatus('当前离线：可继续使用本地功能', 'warning', { sticky: true });
        }
    };
    window.addEventListener('online', handleConnectivity);
    window.addEventListener('offline', handleConnectivity);
    if (!navigator.onLine) handleConnectivity();

    const swVersion = '5.0.5';
    const registerServiceWorker = async () => {
        if (!('serviceWorker' in navigator)) return;
        const swUrl = new URL('sw.js', window.location.href);
        swUrl.searchParams.set('v', swVersion);

        try {
            const registration = await navigator.serviceWorker.register(swUrl.toString());

            const promptUpdate = () => {
                const waiting = registration.waiting;
                if (!waiting) return;
                const ok = window.confirm('检测到新版本，是否立即刷新应用？');
                if (!ok) {
                    app.showAppStatus('新版本已就绪：下次打开自动更新', 'info', { sticky: true });
                    return;
                }
                waiting.postMessage({ type: 'SKIP_WAITING' });
            };

            if (registration.waiting) {
                promptUpdate();
            }

            registration.addEventListener('updatefound', () => {
                const installing = registration.installing;
                if (!installing) return;
                installing.addEventListener('statechange', () => {
                    if (installing.state !== 'installed') return;
                    if (navigator.serviceWorker.controller) {
                        promptUpdate();
                    } else {
                        app.showAppStatus('离线能力已就绪', 'success');
                    }
                });
            });

            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (window.__selfSystemSwReloading) return;
                window.__selfSystemSwReloading = true;
                window.location.reload();
            });
        } catch {
            app.showAppStatus('离线能力初始化失败', 'warning', { sticky: true });
        }
    };

    registerServiceWorker();
});
