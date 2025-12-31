class PDFViewer {
    constructor() {
        this.currentPage = 1;
        this.totalPages = 1123; // 根据实际PDF页数设置
        this.isFullscreen = false;
        this.bookmarks = new Set();
        this.init();
    }

    init() {
        this.createUI();
        this.bindEvents();
        this.loadPDF();
    }

    createUI() {
        const pdfContainer = document.createElement('div');
        pdfContainer.className = 'pdf-module';
        pdfContainer.innerHTML = `
            <div class="pdf-header">
                <h2><i class="fas fa-book"></i> 中国古代名句辞典</h2>
                <div class="pdf-controls">
                    <button class="btn btn-sm" id="pdfPrevPage">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <span class="page-info">
                        第 <input type="number" id="pdfPageInput" min="1" max="${this.totalPages}" value="1"> 页 / 共 ${this.totalPages} 页
                    </span>
                    <button class="btn btn-sm" id="pdfNextPage">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    <button class="btn btn-sm" id="pdfToggleFullscreen">
                        <i class="fas fa-expand"></i>
                    </button>
                    <button class="btn btn-sm" id="pdfToggleBookmark">
                        <i class="far fa-bookmark"></i>
                    </button>
                    <button class="btn btn-sm" id="pdfShowToc">
                        <i class="fas fa-list"></i> 目录
                    </button>
                </div>
            </div>
            
            <div class="pdf-content">
                <object 
                    id="pdfObject" 
                    data="中国古代名句辞典(修订本).1_副本.pdf#page=1" 
                    type="application/pdf"
                    width="100%" 
                    height="600">
                    
                    <div class="pdf-fallback">
                        <p>您的浏览器不支持PDF预览，请<a href="中国古代名句辞典(修订本).1_副本.pdf" download>下载PDF文件</a></p>
                    </div>
                </object>
            </div>
            
            <div class="pdf-sidebar" id="pdfSidebar">
                <div class="sidebar-header">
                    <h3>目录导航</h3>
                    <button class="btn btn-sm" id="closeSidebar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="toc-content" id="tocContent">
                    <div class="toc-loading">
                        <i class="fas fa-spinner fa-spin"></i> 加载目录中...
                    </div>
                </div>
            </div>
        `;

        document.querySelector('.module-content').appendChild(pdfContainer);
    }

    bindEvents() {
        // 页面导航
        document.getElementById('pdfPrevPage').addEventListener('click', () => this.goToPage(this.currentPage - 1));
        document.getElementById('pdfNextPage').addEventListener('click', () => this.goToPage(this.currentPage + 1));
        
        // 页面输入
        const pageInput = document.getElementById('pdfPageInput');
        pageInput.addEventListener('change', (e) => {
            const page = parseInt(e.target.value);
            if (page >= 1 && page <= this.totalPages) {
                this.goToPage(page);
            }
        });

        // 全屏切换
        document.getElementById('pdfToggleFullscreen').addEventListener('click', () => this.toggleFullscreen());

        // 书签功能
        document.getElementById('pdfToggleBookmark').addEventListener('click', () => this.toggleBookmark());

        // 目录显示
        document.getElementById('pdfShowToc').addEventListener('click', () => this.showToc());
        document.getElementById('closeSidebar').addEventListener('click', () => this.hideToc());

        // 键盘快捷键
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    loadPDF() {
        // 模拟加载PDF，实际中可以根据需要添加加载状态
        console.log('PDF加载中...');
        this.generateToc();
    }

    goToPage(page) {
        if (page < 1) page = 1;
        if (page > this.totalPages) page = this.totalPages;
        
        this.currentPage = page;
        document.getElementById('pdfPageInput').value = page;
        
        // 更新PDF对象
        const pdfObject = document.getElementById('pdfObject');
        pdfObject.data = `中国古代名句辞典(修订本).1_副本.pdf#page=${page}`;
        
        // 更新书签图标
        this.updateBookmarkIcon();
    }

    toggleFullscreen() {
        this.isFullscreen = !this.isFullscreen;
        const pdfContent = document.querySelector('.pdf-content');
        const btn = document.getElementById('pdfToggleFullscreen');
        
        if (this.isFullscreen) {
            pdfContent.classList.add('fullscreen');
            btn.innerHTML = '<i class="fas fa-compress"></i>';
        } else {
            pdfContent.classList.remove('fullscreen');
            btn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    }

    toggleBookmark() {
        if (this.bookmarks.has(this.currentPage)) {
            this.bookmarks.delete(this.currentPage);
        } else {
            this.bookmarks.add(this.currentPage);
        }
        this.updateBookmarkIcon();
    }

    updateBookmarkIcon() {
        const btn = document.getElementById('pdfToggleBookmark');
        if (this.bookmarks.has(this.currentPage)) {
            btn.innerHTML = '<i class="fas fa-bookmark"></i>';
            btn.classList.add('active');
        } else {
            btn.innerHTML = '<i class="far fa-bookmark"></i>';
            btn.classList.remove('active');
        }
    }

    showToc() {
        document.getElementById('pdfSidebar').classList.add('active');
    }

    hideToc() {
        document.getElementById('pdfSidebar').classList.remove('active');
    }

    generateToc() {
        // 根据用户提供的详细目录结构生成目录
        const tocContent = document.getElementById('tocContent');
        tocContent.innerHTML = `
            <div class="toc-section">
                <h4>📖 中国古代名句辞典详细目录</h4>
                <div class="toc-items">
                    <div class="toc-item" data-page="25">
                        <i class="fas fa-mountain"></i>
                        <span>1. 天地景色</span>
                        <span class="page-num">25</span>
                    </div>
                    <div class="toc-item" data-page="67">
                        <i class="fas fa-calendar"></i>
                        <span>2. 四时</span>
                        <span class="page-num">67</span>
                    </div>
                    <div class="toc-item" data-page="87">
                        <i class="fas fa-leaf"></i>
                        <span>3. 生物</span>
                        <span class="page-num">87</span>
                    </div>
                    <div class="toc-item" data-page="118">
                        <i class="fas fa-globe"></i>
                        <span>4. 境界</span>
                        <span class="page-num">118</span>
                    </div>
                    <div class="toc-item" data-page="127">
                        <i class="fas fa-city"></i>
                        <span>5. 城乡，建筑，舟车</span>
                        <span class="page-num">127</span>
                    </div>
                    <div class="toc-item" data-page="142">
                        <i class="fas fa-flag"></i>
                        <span>6. 国家</span>
                        <span class="page-num">142</span>
                    </div>
                    <div class="toc-item" data-page="163">
                        <i class="fas fa-users"></i>
                        <span>7. 人民</span>
                        <span class="page-num">163</span>
                    </div>
                    <div class="toc-item" data-page="174">
                        <i class="fas fa-landmark"></i>
                        <span>8. 政治</span>
                        <span class="page-num">174</span>
                    </div>
                    <div class="toc-item" data-page="222">
                        <i class="fas fa-fighter-jet"></i>
                        <span>9. 战争</span>
                        <span class="page-num">222</span>
                    </div>
                    <div class="toc-item" data-page="239">
                        <i class="fas fa-user"></i>
                        <span>10. 外貌和内心</span>
                        <span class="page-num">239</span>
                    </div>
                    <div class="toc-item" data-page="262">
                        <i class="fas fa-handshake"></i>
                        <span>11. 伦理</span>
                        <span class="page-num">262</span>
                    </div>
                    <div class="toc-item" data-page="278">
                        <i class="fas fa-brain"></i>
                        <span>12. 意志</span>
                        <span class="page-num">278</span>
                    </div>
                    <div class="toc-item" data-page="307">
                        <i class="fas fa-heart"></i>
                        <span>13. 感情</span>
                        <span class="page-num">307</span>
                    </div>
                    <div class="toc-item" data-page="382">
                        <i class="fas fa-lightbulb"></i>
                        <span>14. 智力</span>
                        <span class="page-num">382</span>
                    </div>
                    <div class="toc-item" data-page="395">
                        <i class="fas fa-graduation-cap"></i>
                        <span>15. 人才</span>
                        <span class="page-num">395</span>
                    </div>
                    <div class="toc-item" data-page="429">
                        <i class="fas fa-award"></i>
                        <span>16. 品德</span>
                        <span class="page-num">429</span>
                    </div>
                    <div class="toc-item" data-page="489">
                        <i class="fas fa-chalkboard-teacher"></i>
                        <span>17. 教学</span>
                        <span class="page-num">489</span>
                    </div>
                    <div class="toc-item" data-page="514">
                        <i class="fas fa-comments"></i>
                        <span>18. 言行</span>
                        <span class="page-num">514</span>
                    </div>
                    <div class="toc-item" data-page="533">
                        <i class="fas fa-handshake"></i>
                        <span>19. 社交</span>
                        <span class="page-num">533</span>
                    </div>
                    <div class="toc-item" data-page="560">
                        <i class="fas fa-tasks"></i>
                        <span>20. 处事</span>
                        <span class="page-num">560</span>
                    </div>
                    <div class="toc-item" data-page="596">
                        <i class="fas fa-home"></i>
                        <span>21. 家庭</span>
                        <span class="page-num">596</span>
                    </div>
                    <div class="toc-item" data-page="607">
                        <i class="fas fa-utensils"></i>
                        <span>22. 生活</span>
                        <span class="page-num">607</span>
                    </div>
                    <div class="toc-item" data-page="662">
                        <i class="fas fa-globe-americas"></i>
                        <span>23. 世道</span>
                        <span class="page-num">662</span>
                    </div>
                    <div class="toc-item" data-page="693">
                        <i class="fas fa-yin-yang"></i>
                        <span>24. 哲理</span>
                        <span class="page-num">693</span>
                    </div>
                    <div class="toc-item" data-page="736">
                        <i class="fas fa-cogs"></i>
                        <span>25. 生产与科技</span>
                        <span class="page-num">736</span>
                    </div>
                    <div class="toc-item" data-page="753">
                        <i class="fas fa-gavel"></i>
                        <span>26. 法律</span>
                        <span class="page-num">753</span>
                    </div>
                    <div class="toc-item" data-page="769">
                        <i class="fas fa-book"></i>
                        <span>27. 文学</span>
                        <span class="page-num">769</span>
                    </div>
                    <div class="toc-item" data-page="807">
                        <i class="fas fa-paint-brush"></i>
                        <span>28. 艺术</span>
                        <span class="page-num">807</span>
                    </div>
                    <div class="toc-item" data-page="822">
                        <i class="fas fa-shield-alt"></i>
                        <span>29. 军事</span>
                        <span class="page-num">822</span>
                    </div>
                    <div class="toc-item" data-page="841">
                        <i class="fas fa-atom"></i>
                        <span>30. 物性事理</span>
                        <span class="page-num">841</span>
                    </div>
                </div>
            </div>
        `;

        // 添加目录项点击事件
        document.querySelectorAll('.toc-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = parseInt(item.getAttribute('data-page'));
                this.goToPage(page);
                this.hideToc();
            });
        });
    }

    handleKeyboard(e) {
        if (e.target.tagName === 'INPUT') return;
        
        switch(e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                this.goToPage(this.currentPage - 1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.goToPage(this.currentPage + 1);
                break;
            case 'Home':
                e.preventDefault();
                this.goToPage(1);
                break;
            case 'End':
                e.preventDefault();
                this.goToPage(this.totalPages);
                break;
            case 'b':
                e.preventDefault();
                this.toggleBookmark();
                break;
            case 'f':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 't':
                e.preventDefault();
                this.showToc();
                break;
        }
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFViewer;
}