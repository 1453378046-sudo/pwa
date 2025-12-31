const fs = require('fs');
const pdfParse = require('pdf-parse');

async function parsePDF() {
    try {
        console.log('开始解析PDF文件...');
        
        const dataBuffer = fs.readFileSync('中国古代名句辞典(修订本).1_副本.pdf');
        const data = await pdfParse(dataBuffer);
        
        console.log('PDF信息:');
        console.log('- 总页数:', data.numpages);
        console.log('- 文本长度:', data.text.length, '字符');
        
        // 提取前几页内容进行分析
        const firstPages = data.text.substring(0, 3000);
        console.log('\n前几页内容预览:');
        console.log(firstPages);
        
        // 尝试提取目录信息
        extractTableOfContents(data.text);
        
        // 保存解析结果
        fs.writeFileSync('pdf-content.txt', data.text);
        console.log('\nPDF内容已保存到 pdf-content.txt');
        
    } catch (error) {
        console.error('解析PDF时出错:', error);
    }
}

function extractTableOfContents(text) {
    console.log('\n=== 尝试提取目录信息 ===');
    
    const lines = text.split('\n');
    let tocLines = [];
    
    // 查找可能的目录项
    for (let i = 0; i < Math.min(200, lines.length); i++) {
        const line = lines[i].trim();
        
        // 匹配中文目录项模式
        if (line.match(/^第[一二三四五六七八九十百千万亿]+\s*[章节篇卷]/) ||
            line.match(/^\d+(\.\d+)*\s+[\u4e00-\u9fff]/) ||
            line.match(/^[一二三四五六七八九十]、/) ||
            line.match(/^[A-Za-z]+\./)) {
            tocLines.push(`${i + 1}: ${line}`);
        }
    }
    
    if (tocLines.length > 0) {
        console.log('找到可能的目录项:');
        tocLines.slice(0, 20).forEach(line => {
            console.log(line);
        });
        
        if (tocLines.length > 20) {
            console.log(`... 还有 ${tocLines.length - 20} 个目录项`);
        }
        
        fs.writeFileSync('toc-extracted.txt', tocLines.join('\n'));
        console.log('目录信息已保存到 toc-extracted.txt');
    } else {
        console.log('未找到明显的目录格式');
        
        console.log('\n前30行内容:');
        for (let i = 0; i < Math.min(30, lines.length); i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
    }
}

parsePDF();