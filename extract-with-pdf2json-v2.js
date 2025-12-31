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
                console.log('📊 PDF数据结构:', Object.keys(pdfData));
                
                // 检查数据格式
                if (pdfData.Pages) {
                    console.log(`找到 ${pdfData.Pages.length} 页`);
                    
                    let fullText = '';
                    
                    // 遍历所有页面提取文本
                    pdfData.Pages.forEach((page, pageIndex) => {
                        console.log(`处理第 ${pageIndex + 1} 页...`);
                        
                        if (page.Texts && page.Texts.length > 0) {
                            let pageText = '';
                            
                            page.Texts.forEach(textObj => {
                                if (textObj.R && textObj.R.length > 0) {
                                    textObj.R.forEach(r => {
                                        if (r.T) {
                                            // 解码URL编码的文本
                                            try {
                                                const decodedText = decodeURIComponent(r.T);
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
                        } else {
                            console.log(`第 ${pageIndex + 1} 页没有文本内容`);
                        }
                    });
                    
                    if (fullText) {
                        // 保存文本文件
                        const outputFile = '中国古代名句辞典-文字版.txt';
                        fs.writeFileSync(outputFile, fullText, 'utf8');
                        
                        console.log(`💾 文本内容已保存到: ${outputFile}`);
                        console.log(`📊 总字符数: ${fullText.length}`);
                        
                        // 显示预览
                        console.log('\n📋 内容预览:');
                        console.log('='.repeat(50));
                        const preview = fullText.substring(0, 500);
                        console.log(preview);
                        console.log('='.repeat(50));
                        
                        resolve({
                            success: true,
                            pageCount: pdfData.Pages.length,
                            textLength: fullText.length,
                            outputFile: outputFile
                        });
                    } else {
                        console.log('⚠️  没有提取到任何文本内容');
                        
                        // 检查是否是图像PDF
                        const hasImages = pdfData.Pages.some(page => page.Images && page.Images.length > 0);
                        if (hasImages) {
                            console.log('💡 这个PDF主要是图像格式，需要使用OCR技术');
                        }
                        
                        reject(new Error('PDF中没有可提取的文本内容'));
                    }
                } else {
                    console.log('❌ 无法找到页面数据');
                    reject(new Error('PDF数据格式不正确'));
                }
                
            } catch (error) {
                console.error('处理PDF数据时出错:', error.message);
                reject(error);
            }
        });
        
        // 开始解析
        console.log('正在解析PDF文件，请稍候...');
        pdfParser.loadPDF('中国古代名句辞典(修订本).1_副本.pdf');
        
    });
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
            console.log('💡 建议使用Tesseract OCR或在线OCR服务');
            console.log('💡 或者使用我之前开发的OCR系统进行批量处理');
        }
    });