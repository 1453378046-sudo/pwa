const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SimpleOCRProcessor {
    constructor() {
        this.outputDir = './ocr-output';
        this.tempDir = './temp-images';
        this.ensureDirectories();
    }
    
    ensureDirectories() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }
    
    // 使用系统工具提取PDF图像
    extractPDFImages(pdfPath, startPage = 1, endPage = 10) {
        console.log('📷 提取PDF图像...');
        
        try {
            // 使用pdftoppm提取图像（如果可用）
            const command = `pdftoppm -png -r 300 -f ${startPage} -l ${endPage} "${pdfPath}" "${this.tempDir}/page"`;
            execSync(command, { stdio: 'pipe' });
            
            const images = fs.readdirSync(this.tempDir)
                .filter(file => file.endsWith('.png'))
                .sort();
            
            console.log(`✅ 提取了 ${images.length} 张图像`);
            return images;
            
        } catch (error) {
            console.log('❌ pdftoppm不可用，尝试其他方法...');
            
            // 备用方案：使用pdfimages
            try {
                const pdfimagesCmd = `pdfimages -png "${pdfPath}" "${this.tempDir}/image"`;
                execSync(pdfimagesCmd, { stdio: 'pipe' });
                
                const images = fs.readdirSync(this.tempDir)
                    .filter(file => file.endsWith('.png'))
                    .sort();
                
                console.log(`✅ 使用pdfimages提取了 ${images.length} 张图像`);
                return images.slice(0, endPage - startPage + 1);
                
            } catch (error2) {
                console.log('❌ 两种图像提取方法都不可用');
                console.log('💡 请安装以下工具之一：');
                console.log('   - poppler-utils (包含pdftoppm, pdfimages)');
                console.log('   - 或使用在线OCR服务');
                return [];
            }
        }
    }
    
    // 使用Tesseract进行OCR
    performOCR(imagePath, pageNumber) {
        console.log(`🔍 对第 ${pageNumber} 页进行OCR...`);
        
        const outputFile = path.join(this.outputDir, `page-${pageNumber}.txt`);
        
        try {
            const command = `tesseract "${imagePath}" "${outputFile}" -l chi_sim+chi_tra --psm 6`;
            execSync(command, { stdio: 'pipe' });
            
            // 读取OCR结果
            const text = fs.readFileSync(outputFile + '.txt', 'utf8');
            
            console.log(`✅ 第 ${pageNumber} 页OCR完成，字符数: ${text.length}`);
            return text;
            
        } catch (error) {
            console.log(`❌ 第 ${pageNumber} 页OCR失败: ${error.message}`);
            
            // 备用方案：使用tesseract.js（如果系统tesseract不可用）
            if (error.message.includes('tesseract') || error.message.includes('command not found')) {
                console.log('💡 Tesseract未安装，请安装: brew install tesseract tesseract-lang')
            }
            
            return '';
        }
    }
    
    // 处理整个PDF
    async processPDF(pdfPath, maxPages = 10) {
        console.log('🚀 开始处理PDF文件:', pdfPath);
        console.log('='.repeat(60));
        
        // 提取图像
        const images = this.extractPDFImages(pdfPath, 1, maxPages);
        
        if (images.length === 0) {
            console.log('❌ 无法提取图像，OCR处理终止');
            return false;
        }
        
        let allText = '';
        
        // 对每张图像进行OCR
        for (let i = 0; i < images.length; i++) {
            const imagePath = path.join(this.tempDir, images[i]);
            const pageNumber = i + 1;
            
            const text = this.performOCR(imagePath, pageNumber);
            
            if (text) {
                allText += `=== 第 ${pageNumber} 页 ===\n`;
                allText += text + '\n\n';
                
                // 显示预览
                if (pageNumber <= 3) {
                    console.log('📋 内容预览:');
                    console.log(text.substring(0, 200) + '...');
                    console.log('-'.repeat(40));
                }
            }
        }
        
        // 保存完整文本
        if (allText) {
            const finalOutput = path.join(this.outputDir, 'complete-text.txt');
            fs.writeFileSync(finalOutput, allText, 'utf8');
            
            console.log('='.repeat(60));
            console.log('🎉 OCR处理完成！');
            console.log(`📄 总页数处理: ${images.length}`);
            console.log(`📝 总字符数: ${allText.length}`);
            console.log(`💾 输出文件: ${finalOutput}`);
            
            // 显示统计信息
            const chineseChars = (allText.match(/[\u4e00-\u9fff]/g) || []).length;
            console.log(`🔤 中文字符: ${chineseChars}`);
            
            return true;
        } else {
            console.log('❌ 没有成功提取任何文本');
            return false;
        }
    }
    
    // 清理临时文件
    cleanup() {
        try {
            if (fs.existsSync(this.tempDir)) {
                fs.rmSync(this.tempDir, { recursive: true, force: true });
            }
        } catch (error) {
            console.log('清理临时文件时出错:', error.message);
        }
    }
}

// 主函数
async function main() {
    const pdfPath = process.argv[2] || '中国古代名句辞典(修订本).1_副本.pdf';
    const maxPages = parseInt(process.argv[3]) || 10;
    
    if (!fs.existsSync(pdfPath)) {
        console.log('❌ PDF文件不存在:', pdfPath);
        return;
    }
    
    const processor = new SimpleOCRProcessor();
    
    try {
        const success = await processor.processPDF(pdfPath, maxPages);
        
        if (success) {
            console.log('\n💡 提示: 这是前几页的测试结果');
            console.log('💡 要处理完整文件，请安装必要的OCR工具');
            console.log('💡 推荐安装: brew install poppler tesseract tesseract-lang');
        }
        
    } catch (error) {
        console.log('❌ 处理过程中出错:', error.message);
    } finally {
        processor.cleanup();
    }
}

// 执行
main().catch(console.error);