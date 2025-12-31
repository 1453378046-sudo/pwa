const http = require('http');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const unzipper = require('unzipper');

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.map': 'application/json',
    '.xml': 'application/xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.xhtml': 'application/xhtml+xml',
    '.opf': 'application/oebps-package+xml',
    '.ncx': 'application/x-dtbncx+xml',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.epub': 'application/epub+zip'
};

const readingPlansFilePath = path.join(__dirname, 'reading_plans.json');
const repaymentExcelFilePath = path.join(__dirname, '借款.xlsx');
const repaymentJsonFilePath = path.join(__dirname, 'repayment_data.json');

function loadReadingPlansFromDisk() {
    try {
        const raw = fs.readFileSync(readingPlansFilePath, 'utf-8');
        const parsed = raw ? JSON.parse(raw) : {};
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.plans)) return parsed.plans;
    } catch {
    }
    return [];
}

function saveReadingPlansToDisk(plans) {
    try {
        fs.writeFileSync(readingPlansFilePath, JSON.stringify({ plans: plans || [] }, null, 2), 'utf-8');
    } catch {
    }
}

let readingPlans = loadReadingPlansFromDisk();

function loadRepaymentRowsFromDisk() {
    try {
        if (fs.existsSync(repaymentExcelFilePath)) {
            const workbook = XLSX.readFile(repaymentExcelFilePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            if (Array.isArray(rows)) return rows;
        }
    } catch {
    }

    try {
        if (fs.existsSync(repaymentJsonFilePath)) {
            const raw = fs.readFileSync(repaymentJsonFilePath, 'utf-8');
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed)) return parsed;
        }
    } catch {
    }

    return [];
}

const gkQuotesFilePath = path.join(__dirname, 'gk_quotes.json');

function loadGkQuotesFromDisk() {
    try {
        const raw = fs.readFileSync(gkQuotesFilePath, 'utf-8');
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) return parsed;
    } catch {
    }
    return [];
}

function saveGkQuotesToDisk(quotes) {
    try {
        fs.writeFileSync(gkQuotesFilePath, JSON.stringify(quotes || [], null, 2), 'utf-8');
    } catch {
    }
}

let gkQuotes = loadGkQuotesFromDisk();

const oxfordEpubFileName = '牛津通识读本百本纪念套装（共100册）.epub';
const oxfordEpubFilePath = path.join(__dirname, oxfordEpubFileName);
const oxfordExtractBaseUrl = '/oxford-unzipped/';
const oxfordExtractDir = path.join(__dirname, '.oxford_unzipped_cache');
const oxfordExtractMarker = path.join(oxfordExtractDir, '.ready');
const vendorBaseUrl = '/vendor/';
const vendorRoots = [
    { baseUrl: '/vendor/epubjs/', dir: path.join(__dirname, 'node_modules', 'epubjs', 'dist') },
    { baseUrl: '/vendor/pdfjs/', dir: path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build') },
    { baseUrl: '/vendor/fontawesome/', dir: path.join(__dirname, 'node_modules', '@fortawesome', 'fontawesome-free') }
];

let oxfordExtracting = false;
let oxfordExtractError = '';
let oxfordExtractPromise = null;

function isOxfordExtractReady() {
    try {
        if (!fs.existsSync(oxfordExtractMarker)) return false;
        const containerPath = path.join(oxfordExtractDir, 'META-INF', 'container.xml');
        if (!fs.existsSync(containerPath)) return false;
        const opfPath = path.join(oxfordExtractDir, 'OEBPS', 'content.opf');
        if (!fs.existsSync(opfPath)) return false;
        const cssProbe = path.join(oxfordExtractDir, 'OEBPS', 'flow0108.css');
        if (!fs.existsSync(cssProbe)) return false;
        return true;
    } catch {
        return false;
    }
}

async function extractZipToDirectory(zipPath, targetDir) {
    const directory = await unzipper.Open.file(zipPath);
    for (const entry of directory.files || []) {
        const rel = String(entry?.path || '');
        if (!rel) continue;
        const destPath = path.join(targetDir, rel);
        if (!isPathInside(targetDir, destPath)) continue;
        if (entry.type === 'Directory') {
            fs.mkdirSync(destPath, { recursive: true });
            continue;
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(destPath);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            entry.stream()
                .on('error', reject)
                .pipe(writeStream);
        });
    }
}

async function ensureOxfordExtracted() {
    if (isOxfordExtractReady()) {
        return { ok: true, ready: true, extracting: false, error: '' };
    }
    if (!fs.existsSync(oxfordEpubFilePath)) {
        return { ok: false, ready: false, extracting: false, error: 'epub_not_found' };
    }
    if (oxfordExtractPromise) return oxfordExtractPromise;

    oxfordExtracting = true;
    oxfordExtractError = '';

    const tmpDir = `${oxfordExtractDir}.tmp`;
    const job = (async () => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            fs.mkdirSync(tmpDir, { recursive: true });

            await extractZipToDirectory(oxfordEpubFilePath, tmpDir);

            const requiredFiles = [
                path.join(tmpDir, 'META-INF', 'container.xml'),
                path.join(tmpDir, 'OEBPS', 'content.opf'),
                path.join(tmpDir, 'OEBPS', 'flow0108.css')
            ];
            const missing = requiredFiles.filter(p => !fs.existsSync(p));
            if (missing.length) {
                throw new Error('extract_incomplete');
            }

            fs.writeFileSync(path.join(tmpDir, '.ready'), new Date().toISOString(), 'utf-8');
            fs.rmSync(oxfordExtractDir, { recursive: true, force: true });
            fs.renameSync(tmpDir, oxfordExtractDir);
            return { ok: true, ready: true, extracting: false, error: '' };
        } catch (e) {
            oxfordExtractError = String(e?.message || e || 'extract_failed');
            try {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {
            }
            return { ok: false, ready: false, extracting: false, error: oxfordExtractError };
        } finally {
            oxfordExtracting = false;
            oxfordExtractPromise = null;
        }
    })();

    oxfordExtractPromise = job;
    return job;
}

function buildOxfordStatus() {
    const fileExists = fs.existsSync(oxfordEpubFilePath);
    return {
        ok: true,
        file: oxfordEpubFileName,
        fileExists,
        ready: isOxfordExtractReady(),
        extracting: oxfordExtracting,
        error: oxfordExtractError || '',
        baseUrl: oxfordExtractBaseUrl
    };
}

function isPathInside(baseDir, filePath) {
    const base = path.resolve(baseDir) + path.sep;
    const target = path.resolve(filePath);
    return target.startsWith(base);
}

function resolveVendorFilePath(pathname) {
    for (const root of vendorRoots) {
        if (!pathname.startsWith(root.baseUrl)) continue;
        const rel = decodeURIComponent(pathname.slice(root.baseUrl.length));
        if (!rel || rel.endsWith('/')) return null;
        const full = path.join(root.dir, rel);
        if (!isPathInside(root.dir, full)) return null;
        return full;
    }
    return null;
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 2_000_000) {
                reject(new Error('payload_too_large'));
                req.destroy();
            }
        });
        req.on('end', () => {
            if (!body) return resolve(null);
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

const server = http.createServer((req, res) => {
    // 移除查询参数，只保留路径部分
    const host = req.headers.host || 'localhost';
    try {
        const url = new URL(req.url, `http://${host}`);
        const pathname = url.pathname || '/';

    if (pathname.startsWith('/api/')) {
        const jsonHeaders = {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        };

        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                ...jsonHeaders,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
            res.end();
            return;
        }

        const repaymentRawPath = '/api/repayment/raw';
        if (pathname === repaymentRawPath) {
            if (req.method === 'GET') {
                const rows = loadRepaymentRowsFromDisk();
                res.writeHead(200, jsonHeaders);
                res.end(JSON.stringify({ ok: true, rows }));
                return;
            }
            res.writeHead(405, jsonHeaders);
            res.end(JSON.stringify({ ok: false }));
            return;
        }

        if (pathname === '/api/oxford/status') {
            res.writeHead(200, jsonHeaders);
            res.end(JSON.stringify(buildOxfordStatus()));
            return;
        }

        if (pathname === '/api/oxford/extract') {
            if (req.method !== 'POST') {
                res.writeHead(405, jsonHeaders);
                res.end(JSON.stringify({ ok: false }));
                return;
            }
            ensureOxfordExtracted()
                .then(result => {
                    res.writeHead(result.ok ? 200 : 500, jsonHeaders);
                    res.end(JSON.stringify({ ...buildOxfordStatus(), ...result }));
                })
                .catch(() => {
                    res.writeHead(500, jsonHeaders);
                    res.end(JSON.stringify({ ...buildOxfordStatus(), ok: false }));
                });
            return;
        }

        const gkQuotesPath = '/api/gk/quotes';
        if (pathname === gkQuotesPath) {
            if (req.method === 'GET') {
                res.writeHead(200, jsonHeaders);
                res.end(JSON.stringify({ quotes: gkQuotes }));
                return;
            }

            if (req.method === 'POST') {
                readJsonBody(req)
                    .then(payload => {
                        const quotes = payload && Array.isArray(payload) ? payload : [];
                        gkQuotes = quotes;
                        saveGkQuotesToDisk(gkQuotes);
                        res.writeHead(200, jsonHeaders);
                        res.end(JSON.stringify({ ok: true, count: quotes.length }));
                    })
                    .catch(() => {
                        res.writeHead(400, jsonHeaders);
                        res.end(JSON.stringify({ ok: false }));
                    });
                return;
            }

            res.writeHead(405, jsonHeaders);
            res.end(JSON.stringify({ ok: false }));
            return;
        }

        const planListPath = '/api/reading/plans';
        if (pathname === planListPath) {
            if (req.method === 'GET') {
                res.writeHead(200, jsonHeaders);
                res.end(JSON.stringify({ plans: readingPlans }));
                return;
            }

            if (req.method === 'POST') {
                readJsonBody(req)
                    .then(payload => {
                        const plan = payload && typeof payload === 'object' ? payload : {};
                        const id = typeof plan.id === 'string' && plan.id.trim() ? plan.id.trim() : `reading-${Date.now()}`;
                        const next = { ...plan, id };
                        const idx = readingPlans.findIndex(p => p && p.id === id);
                        if (idx >= 0) readingPlans[idx] = next;
                        else readingPlans.unshift(next);
                        saveReadingPlansToDisk(readingPlans);
                        res.writeHead(200, jsonHeaders);
                        res.end(JSON.stringify({ ok: true, plan: next }));
                    })
                    .catch(() => {
                        res.writeHead(400, jsonHeaders);
                        res.end(JSON.stringify({ ok: false }));
                    });
                return;
            }

            res.writeHead(405, jsonHeaders);
            res.end(JSON.stringify({ ok: false }));
            return;
        }

        if (pathname.startsWith(planListPath + '/')) {
            const id = decodeURIComponent(pathname.slice(planListPath.length + 1));
            if (!id) {
                res.writeHead(400, jsonHeaders);
                res.end(JSON.stringify({ ok: false }));
                return;
            }

            if (req.method === 'DELETE') {
                const before = readingPlans.length;
                readingPlans = readingPlans.filter(p => p && p.id !== id);
                if (readingPlans.length !== before) saveReadingPlansToDisk(readingPlans);
                res.writeHead(200, jsonHeaders);
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            if (req.method === 'PUT') {
                readJsonBody(req)
                    .then(payload => {
                        const plan = payload && typeof payload === 'object' ? payload : {};
                        const next = { ...plan, id };
                        const idx = readingPlans.findIndex(p => p && p.id === id);
                        if (idx >= 0) readingPlans[idx] = next;
                        else readingPlans.unshift(next);
                        saveReadingPlansToDisk(readingPlans);
                        res.writeHead(200, jsonHeaders);
                        res.end(JSON.stringify({ ok: true, plan: next }));
                    })
                    .catch(() => {
                        res.writeHead(400, jsonHeaders);
                        res.end(JSON.stringify({ ok: false }));
                    });
                return;
            }

            res.writeHead(405, jsonHeaders);
            res.end(JSON.stringify({ ok: false }));
            return;
        }

        res.writeHead(404, jsonHeaders);
        res.end(JSON.stringify({ ok: false }));
        return;
    }

    let filePath = '';
    if (pathname.startsWith(vendorBaseUrl)) {
        const resolved = resolveVendorFilePath(pathname);
        if (!resolved) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('文件未找到');
            return;
        }
        filePath = resolved;
    } else if (pathname.startsWith(oxfordExtractBaseUrl)) {
        if (!isOxfordExtractReady()) {
            res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('牛津通识资源准备中，请稍后重试');
            return;
        }
        const rel = decodeURIComponent(pathname.slice(oxfordExtractBaseUrl.length));
        if (!rel || rel.endsWith('/')) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('文件未找到');
            return;
        }
        filePath = path.join(oxfordExtractDir, rel);
        if (!isPathInside(oxfordExtractDir, filePath)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Forbidden');
            return;
        }
    } else {
        filePath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
        filePath = path.join(__dirname, filePath);
    }
    
    const extname = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.stat(filePath, (statErr, stats) => {
        if (statErr) {
            if (statErr.code === 'ENOENT') {
                if (pathname.startsWith(oxfordExtractBaseUrl) && /\/OEBPS\/flow\d+\.css$/i.test(pathname)) {
                    res.writeHead(200, {
                        'Content-Type': 'text/css; charset=utf-8',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    });
                    res.end('');
                    return;
                }
                console.log(`[404] ${pathname}`);
                res.writeHead(404);
                res.end('文件未找到');
            } else {
                console.error(`[500] ${pathname}: ${statErr.code}`);
                res.writeHead(500);
                res.end('服务器错误: ' + statErr.code);
            }
            return;
        }

        const totalSize = stats.size;
        const baseHeaders = {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Last-Modified': new Date(stats.mtimeMs).toUTCString(),
            'ETag': `${totalSize}-${Math.floor(stats.mtimeMs)}`,
            'Accept-Ranges': 'bytes'
        };

        if (req.method === 'HEAD') {
            res.writeHead(200, { ...baseHeaders, 'Content-Length': totalSize });
            res.end();
            return;
        }

        const range = req.headers.range;
        if (range) {
            const match = String(range).match(/bytes=(\d*)-(\d*)/);
            if (!match) {
                res.writeHead(416, baseHeaders);
                res.end();
                return;
            }

            const start = match[1] ? Number(match[1]) : 0;
            const end = match[2] ? Number(match[2]) : (totalSize - 1);
            if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= totalSize) {
                res.writeHead(416, baseHeaders);
                res.end();
                return;
            }

            const chunkSize = (end - start) + 1;
            res.writeHead(206, {
                ...baseHeaders,
                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                'Content-Length': chunkSize
            });

            fs.createReadStream(filePath, { start, end })
                .on('error', () => {
                    res.writeHead(500, baseHeaders);
                    res.end('服务器错误');
                })
                .pipe(res);
            return;
        }

        res.writeHead(200, { ...baseHeaders, 'Content-Length': totalSize });
        fs.createReadStream(filePath)
            .on('error', () => {
                res.writeHead(500, baseHeaders);
                res.end('服务器错误');
            })
            .pipe(res);
    });
    } catch (e) {
        console.error('Request URL parsing error:', e);
        res.writeHead(400);
        res.end('Bad Request');
    }
});

const PORT = 8080;
server.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 自我系统 PWA 应用已启动');
    console.log('📍 访问地址: http://localhost:' + PORT);
    console.log('========================================');
    console.log('🎯 六大核心系统:');
    console.log('✅ 1. 清单系统 - 任务管理和优先级排序');
    console.log('✅ 2. 学习系统 - 每日学习规划和日历管理');
    console.log('✅ 3. 财务系统 - 资产跟踪和预算管理');
    console.log('✅ 4. 生活系统 - 习惯追踪和健康管理');
    console.log('✅ 5. 工作系统 - 项目进度和职业发展');
    console.log('✅ 6. 智慧系统 - 知识积累和思维训练');
    console.log('========================================');
    console.log('📱 PWA 功能:');
    console.log('✅ 离线使用');
    console.log('✅ 添加到主屏幕');
    console.log('✅ 推送通知');
    console.log('✅ 后台同步');
    console.log('========================================');
});
