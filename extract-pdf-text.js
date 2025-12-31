const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function extractPDFText(pdfPath, outputPath) {
    console.log('📄 开始提取PDF文本内容...');
    console.log('📁 输入文件:', pdfPath);
    
    try {
        // 读取PDF文件
        const dataBuffer = fs.readFileSync(pdfPath);
        
        console.log('🔍 解析PDF文件...');
        
        // 解析PDF - pdf-parse v2使用PDFParse类
        const { PDFParse } = require('pdf-parse');
        const data = await new PDFParse(dataBuffer);
        
        console.log('✅ PDF解析完成');
        console.log('📊 页面数量:', data.numpages);
        console.log('📝 文本长度:', data.text.length);
        
        // 检查是否有文本内容
        if (data.text && data.text.trim().length > 0) {
            console.log('💾 保存文本内容...');
            
            // 创建输出目录
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            // 保存文本
            fs.writeFileSync(outputPath, data.text, 'utf8');
            
            console.log('🎉 文本提取成功！');
            console.log('📁 输出文件:', outputPath);
            
            // 显示文本预览
            console.log('\n📋 文本预览:');
            console.log('-'.repeat(50));
            const preview = data.text.substring(0, 300).replace(/\n/g, '\\n');
            console.log(preview + (data.text.length > 300 ? '...' : ''));
            console.log('-'.repeat(50));
            
            return {
                success: true,
                numpages: data.numpages,
                textLength: data.text.length,
                outputPath: outputPath
            };
            
        } else {
            console.log('❌ PDF中没有找到可提取的文本内容');
            console.log('💡 这可能是一个图像型PDF，需要OCR处理');
            
            return {
                success: false,
                reason: 'no_text_content',
                numpages: data.numpages
            };
        }
        
    } catch (error) {
        console.log('❌ 提取过程中出错:', error.message);
        
        return {
            success: false,
            reason: 'extraction_error',
            error: error.message
        };
    }
}

// 主函数
async function main() {
    const pdfPath = process.argv[2] || '中国古代名句辞典(修订本).1_副本.pdf';
    const outputPath = process.argv[3] || './extracted-text/complete-text.txt';
    
    if (!fs.existsSync(pdfPath)) {
        console.log('❌ PDF文件不存在:', pdfPath);
        console.log('💡 请提供正确的PDF文件路径');
        return;
    }
    
    console.log('='.repeat(60));
    console.log('🔍 PDF文本提取工具');
    console.log('='.repeat(60));
    
    const result = await extractPDFText(pdfPath, outputPath);
    
    console.log('\n📊 提取结果:');
    console.log('- 成功:', result.success);
    console.log('- 页面数:', result.numpages);
    
    if (result.success) {
        console.log('- 文本长度:', result.textLength + ' 字符');
        console.log('- 输出文件:', result.outputPath);
    } else {
        console.log('- 失败原因:', result.reason);
        if (result.error) {
            console.log('- 错误信息:', result.error);
        }
        
        console.log('\n💡 建议:');
        console.log('1. 如果PDF是图像型，需要安装OCR工具');
        console.log('2. 安装命令: brew install poppler tesseract tesseract-lang');
        console.log('3. 或使用在线OCR服务');
    }
    
    console.log('='.repeat(60));
}

// 执行
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { extractPDFText };