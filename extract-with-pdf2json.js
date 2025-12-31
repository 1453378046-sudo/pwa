const fs = require('fs');
const PDFParser = require('pdf2json');

async function extractPDFText() {
    console.log('📖 开始使用pdf2json提取PDF文本...');
    
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        
        pdfParser.on('pdfParser_dataError', errData => {
            console.error('❌ PDF解析错误:', errData.parserError);
            reject(new Error(errData.parserError));
        });
        
        pdfParser.on('pdfParser_dataReady', pdfData => {
            try {
                console.log('✅ PDF解析完成！');
                
                // 提取文本内容
                const textContent = extractTextFromPDFData(pdfData);
                
                console.log('📊 提取统计:');
                console.log(`   总页数: ${pdfData.formImage.Pages.length}`);
                console.log(`   文本长度: ${textContent.length} 字符`);
                
                // 保存文本文件
                const outputFile = '中国古代名句辞典-文字版.txt';
                fs.writeFileSync(outputFile, textContent, 'utf8');
                
                console.log(`💾 文本内容已保存到: ${outputFile}`);
                
                // 显示预览
                console.log('\n📋 内容预览:');
                console.log('='.repeat(50));
                const preview = textContent.substring(0, 500);
                console.log(preview);
                console.log('='.repeat(50));
                
                resolve({
                    success: true,
                    pageCount: pdfData.formImage.Pages.length,
                    textLength: textContent.length,
                    outputFile: outputFile
                });
                
            } catch (error) {
                reject(error);
            }
        });
        
        // 开始解析
        console.log('正在解析PDF文件，请稍候...');
        pdfParser.loadPDF('中国古代名句辞典(修订本).1_副本.pdf');
        
    });
}

function extractTextFromPDFData(pdfData) {
    let fullText = '';
    
    if (!pdfData.formImage || !pdfData.formImage.Pages) {
        throw new Error('PDF数据格式不正确');
    }
    
    // 遍历所有页面提取文本
    pdfData.formImage.Pages.forEach((page, pageIndex) => {
        if (page.Texts && page.Texts.length > 0) {
            let pageText = '';
            
            page.Texts.forEach(textObj => {
                if (textObj.R && textObj.R.length > 0) {
                    textObj.R.forEach(r => {
                        if (r.T) {
                            // 解码Base64编码的文本
                            try {
                                const decodedText = Buffer.from(r.T, 'base64').toString('utf8');
                                pageText += decodedText;
                            } catch (e) {
                                pageText += r.T;
                            }
                        }
                    });
                }
            });
            
            // 添加页面分隔符
            if (pageText.trim()) {
                fullText += `=== 第 ${pageIndex + 1} 页 ===\n`;
                fullText += pageText + '\n\n';
            }
        }
    });
    
    return fullText;
}

// 执行提取
extractPDFText()
    .then(result => {
        console.log('🎉 PDF文本提取完成！');
        console.log(`   保存文件: ${result.outputFile}`);
        console.log(`   总页数: ${result.pageCount}`);
        console.log(`   总字符: ${result.textLength}`);
    })
    .catch(error => {
        console.error('❌ 提取失败:', error.message);
        
        if (error.message.includes('No text') || error.message.includes('image')) {
            console.log('\n💡 这个PDF可能是图像格式，需要使用OCR技术');
            console.log('💡 建议使用专业的OCR软件或在线服务');
        }
    });