
class TodoCalendar {
    constructor() {
        this.currentDate = new Date();
        this.selectedDate = new Date();
        this.schedules = this.loadSchedules();

        this.initDOMElements();
        if (!this.isDomReady()) {
            return;
        }
        this.initEventListeners();

        this.renderCalendar();
        this.updateSelectedDateInfo();
    }

    isExamSchedule(schedule) {
        if (!schedule) return false;
        if (schedule.timetableCourseType === 'exam') return true;
        const content = String(schedule.content || '');
        return content.startsWith('[考试]');
    }

    formatTimeHHMM(date) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    getVisibleDaySchedules(date, daySchedules) {
        const list = Array.isArray(daySchedules) ? daySchedules : [];
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return list;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const isPast = day.getTime() < today.getTime();
        const isToday = day.getTime() === today.getTime();
        const nowTime = this.formatTimeHHMM(now);

        return list.filter((schedule) => {
            if (!this.isExamSchedule(schedule)) return true;
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

    normalizeSchedules(raw) {
        const input = raw && typeof raw === 'object' ? raw : {};
        const normalized = {};
        Object.keys(input).forEach((key) => {
            const value = input[key];
            if (Array.isArray(value)) {
                normalized[key] = value;
                return;
            }
            if (value && typeof value === 'object') {
                const items = Object.values(value).filter(Boolean);
                normalized[key] = Array.isArray(items) ? items : [];
                return;
            }
            normalized[key] = [];
        });
        return normalized;
    }

    reloadSchedules() {
        this.schedules = this.loadSchedules();
        this.renderCalendar();
        this.updateSelectedDateInfo();
    }

    isDomReady() {
        return Boolean(
            this.calendarGrid &&
            this.yearSelect &&
            this.monthSelect &&
            this.prevMonthBtn &&
            this.nextMonthBtn &&
            this.goToTodayBtn &&
            this.selectedDateTitle &&
            this.scheduleList &&
            this.addScheduleBtn &&
            this.modal &&
            this.modalTitle &&
            this.closeModalBtn &&
            this.saveScheduleBtn &&
            this.deleteScheduleBtn &&
            this.scheduleIdInput &&
            this.scheduleTimeInput &&
            this.scheduleContentInput &&
            this.schedulePriorityInput
        );
    }

    initDOMElements() {
        // Calendar elements
        this.calendarGrid = document.getElementById('todo-calendar-grid');
        this.yearSelect = document.getElementById('todo-year-select');
        this.monthSelect = document.getElementById('todo-month-select');
        this.prevMonthBtn = document.getElementById('todo-prev-month');
        this.nextMonthBtn = document.getElementById('todo-next-month');
        this.goToTodayBtn = document.getElementById('todo-go-to-today');

        // Schedule elements
        this.selectedDateTitle = document.getElementById('todo-selected-date-title');
        this.scheduleList = document.getElementById('todo-schedule-list');
        this.addScheduleBtn = document.getElementById('todo-add-schedule');

        // Modal elements
        this.modal = document.getElementById('todoScheduleModal');
        this.modalTitle = document.getElementById('todoScheduleModalTitle');
        this.closeModalBtn = document.getElementById('todoCloseScheduleModal');
        this.saveScheduleBtn = document.getElementById('todoSaveSchedule');
        this.deleteScheduleBtn = document.getElementById('todoDeleteSchedule');
        this.scheduleIdInput = document.getElementById('todoScheduleId');
        this.scheduleTimeInput = document.getElementById('todoScheduleTime');
        this.scheduleContentInput = document.getElementById('todoScheduleContent');
        this.schedulePriorityInput = document.getElementById('todoSchedulePriority');
    }

    initEventListeners() {
        this.prevMonthBtn.addEventListener('click', () => this.changeMonth(-1));
        this.nextMonthBtn.addEventListener('click', () => this.changeMonth(1));
        this.goToTodayBtn.addEventListener('click', () => this.goToToday());
        this.yearSelect.addEventListener('change', () => this.renderCalendar());
        this.monthSelect.addEventListener('change', () => this.renderCalendar());
        this.addScheduleBtn.addEventListener('click', () => this.openScheduleModal());
        this.closeModalBtn.addEventListener('click', () => this.closeScheduleModal());
        this.saveScheduleBtn.addEventListener('click', () => this.saveSchedule());
        this.deleteScheduleBtn.addEventListener('click', () => this.deleteSchedule());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeScheduleModal();
            }
        });
    }

    changeMonth(offset) {
        const currentMonth = this.monthSelect.value;
        const currentYear = this.yearSelect.value;
        const newDate = new Date(currentYear, currentMonth, 1);
        newDate.setMonth(newDate.getMonth() + offset);
        this.currentDate = newDate;
        this.populateYearAndMonthSelects();
        this.renderCalendar();
    }

    goToToday() {
        this.currentDate = new Date();
        this.selectedDate = new Date();
        this.populateYearAndMonthSelects();
        this.renderCalendar();
        this.updateSelectedDateInfo();
    }

    renderCalendar() {
        this.populateYearAndMonthSelects();
        const year = this.yearSelect.value;
        const month = this.monthSelect.value;
        this.currentDate = new Date(year, month);

        this.calendarGrid.innerHTML = '';
        const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, parseInt(month) + 1, 0).getDate();

        // Add empty cells for days before the first day of the month
        for (let i = 0; i < firstDay; i++) {
            this.calendarGrid.appendChild(this.createDayCell(null, true));
        }

        // Add cells for each day of the month
        for (let day = 1; day <= daysInMonth; day++) {
            this.calendarGrid.appendChild(this.createDayCell(day));
        }
    }

    createDayCell(day, isOtherMonth = false) {
        const dayCell = document.createElement('div');
        dayCell.classList.add('calendar-day');
        if (isOtherMonth) {
            dayCell.classList.add('other-month');
            return dayCell;
        }

        const dayNumber = document.createElement('div');
        dayNumber.classList.add('day-number');
        dayNumber.textContent = day;
        dayCell.appendChild(dayNumber);

        const date = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day);
        const dateString = date.toDateString();
        const today = new Date().toDateString();

        if (dateString === today) {
            dayCell.classList.add('today');
        }

        if (dateString === this.selectedDate.toDateString()) {
            dayCell.classList.add('selected');
        }

        const daySchedules = Array.isArray(this.schedules[dateString]) ? this.schedules[dateString] : [];
        const visibleSchedules = this.getVisibleDaySchedules(date, daySchedules);
        if (visibleSchedules.length > 0) {
            dayCell.classList.add('has-schedule');
            const badge = document.createElement('div');
            badge.classList.add('schedule-badge');
            badge.textContent = visibleSchedules.length > 9 ? '9+' : String(visibleSchedules.length);
            dayCell.appendChild(badge);
        }

        dayCell.addEventListener('click', () => {
            this.selectedDate = date;
            this.renderCalendar();
            this.updateSelectedDateInfo();
        });

        return dayCell;
    }

    populateYearAndMonthSelects() {
        const currentYear = this.currentDate.getFullYear();
        const currentMonth = this.currentDate.getMonth();

        if (this.yearSelect.options.length === 0) {
            for (let year = currentYear - 5; year <= currentYear + 5; year++) {
                const option = new Option(year, year);
                this.yearSelect.add(option);
            }
        }
        this.yearSelect.value = currentYear;

        if (this.monthSelect.options.length === 0) {
            for (let month = 0; month < 12; month++) {
                const monthName = new Date(0, month).toLocaleString('zh-CN', { month: 'long' });
                const option = new Option(monthName, month);
                this.monthSelect.add(option);
            }
        }
        this.monthSelect.value = currentMonth;
    }

    updateSelectedDateInfo() {
        const dateString = this.selectedDate.toDateString();
        this.selectedDateTitle.textContent = this.selectedDate.toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        this.scheduleList.innerHTML = '';
        const daySchedules = Array.isArray(this.schedules[dateString]) ? this.schedules[dateString] : [];
        const visibleSchedules = this.getVisibleDaySchedules(this.selectedDate, daySchedules);

        if (visibleSchedules.length === 0) {
            this.scheduleList.innerHTML = `<div class="pwa-empty-state"><i class="fas fa-calendar-check"></i><h3>当天暂无日程</h3><p>点击“添加日程”开始安排</p></div>`;
            return;
        }

        visibleSchedules.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

        visibleSchedules.forEach(schedule => {
            const scheduleItem = document.createElement('div');
            scheduleItem.classList.add('schedule-item');
            const priorityText = schedule.priority === 'high' ? '高' : schedule.priority === 'medium' ? '中' : '低';
            scheduleItem.innerHTML = `
                <div class="schedule-time">${schedule.time}</div>
                <div class="schedule-content">${schedule.content}</div>
                <div class="schedule-priority priority-${schedule.priority}">${priorityText}</div>
            `;
            scheduleItem.addEventListener('click', () => this.openScheduleModal(schedule));
            this.scheduleList.appendChild(scheduleItem);
        });
    }

    openScheduleModal(schedule = null) {
        this.modal.classList.add('active');
        if (schedule) {
            this.modalTitle.textContent = '编辑日程';
            this.scheduleIdInput.value = schedule.id;
            this.scheduleTimeInput.value = schedule.time;
            this.scheduleContentInput.value = schedule.content;
            this.schedulePriorityInput.value = schedule.priority;
            this.deleteScheduleBtn.style.display = 'block';
        } else {
            this.modalTitle.textContent = '添加日程';
            this.scheduleIdInput.value = '';
            this.scheduleTimeInput.value = '';
            this.scheduleContentInput.value = '';
            this.schedulePriorityInput.value = 'medium';
            this.deleteScheduleBtn.style.display = 'none';
        }
    }

    closeScheduleModal() {
        this.modal.classList.remove('active');
    }

    saveSchedule() {
        const id = this.scheduleIdInput.value || Date.now().toString();
        const time = this.scheduleTimeInput.value;
        const content = this.scheduleContentInput.value;
        const priority = this.schedulePriorityInput.value;
        const dateString = this.selectedDate.toDateString();

        if (!time || !content) {
            alert('请填写时间和日程内容。');
            return;
        }

        const existingSchedule = (Array.isArray(this.schedules[dateString]) ? this.schedules[dateString] : []).find(s => s.id === id);
        const newSchedule = {
            id,
            time,
            content,
            priority,
            ...(existingSchedule && existingSchedule.planId ? { planId: existingSchedule.planId } : {})
        };

        if (!Array.isArray(this.schedules[dateString])) {
            this.schedules[dateString] = [];
        }

        const existingIndex = this.schedules[dateString].findIndex(s => s.id === id);
        if (existingIndex > -1) {
            this.schedules[dateString][existingIndex] = newSchedule;
        } else {
            this.schedules[dateString].push(newSchedule);
        }

        this.saveSchedules();
        window.dispatchEvent(new CustomEvent('todoSchedulesUpdated', { detail: { dateKey: dateString } }));
        this.renderCalendar();
        this.updateSelectedDateInfo();
        this.closeScheduleModal();
    }

    deleteSchedule() {
        const id = this.scheduleIdInput.value;
        const dateString = this.selectedDate.toDateString();

        if (Array.isArray(this.schedules[dateString])) {
            this.schedules[dateString] = this.schedules[dateString].filter(s => s.id !== id);
            if (this.schedules[dateString].length === 0) {
                delete this.schedules[dateString];
            }
        }

        this.saveSchedules();
        window.dispatchEvent(new CustomEvent('todoSchedulesUpdated', { detail: { dateKey: dateString } }));
        this.renderCalendar();
        this.updateSelectedDateInfo();
        this.closeScheduleModal();
    }

    loadSchedules() {
        try {
            const schedules = localStorage.getItem('todoSchedules');
            const parsed = schedules ? JSON.parse(schedules) : {};
            return this.normalizeSchedules(parsed);
        } catch (error) {
            console.error('加载 Todo 日历日程失败:', error);
            return {};
        }
    }

    saveSchedules() {
        localStorage.setItem('todoSchedules', JSON.stringify(this.schedules));
    }
}
