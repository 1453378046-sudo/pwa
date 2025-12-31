const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function extractPDFWithOCR(pdfPath, outputPath) {
    console.log('🔍 开始OCR处理PDF文件...');
    console.log('📁 输入文件:', pdfPath);
    
    try {
        // 创建输出目录
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // 第一步：将PDF转换为图像
        console.log('🖼️  将PDF转换为图像...');
        const imagesDir = path.join(outputDir, 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        
        // 使用pdftoppm将PDF转换为PNG图像
        try {
            execSync(`pdftoppm -png -r 300 "${pdfPath}" "${path.join(imagesDir, 'page')}"`, {
                stdio: 'inherit'
            });
        } catch (error) {
            console.log('❌ pdftoppm转换失败，尝试使用pdfimages...');
            try {
                execSync(`pdfimages -png "${pdfPath}" "${path.join(imagesDir, 'page')}"`, {
                    stdio: 'inherit'
                });
            } catch (error2) {
                console.log('❌ 两种PDF转图像方法都失败了');
                console.log('💡 请确保已安装poppler工具: brew install poppler');
                throw error2;
            }
        }
        
        // 获取生成的图像文件
        const imageFiles = fs.readdirSync(imagesDir)
            .filter(file => file.endsWith('.png'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/page-?(\d+)/)?.[1] || '0');
                const numB = parseInt(b.match(/page-?(\d+)/)?.[1] || '0');
                return numA - numB;
            });
        
        console.log(`📊 生成 ${imageFiles.length} 张图像`);
        
        if (imageFiles.length === 0) {
            throw new Error('没有生成任何图像文件');
        }
        
        // 第二步：对每张图像进行OCR
        console.log('🔤 开始OCR识别...');
        let fullText = '';
        
        for (let i = 0; i < imageFiles.length; i++) {
            const imageFile = imageFiles[i];
            const imagePath = path.join(imagesDir, imageFile);
            
            console.log(`📄 处理第 ${i + 1}/${imageFiles.length} 页: ${imageFile}`);
            
            try {
                // 使用tesseract进行OCR识别
                const outputFile = path.join(imagesDir, `page_${i + 1}.txt`);
                
                // 尝试简体中文和繁体中文识别
                let ocrText = '';
                try {
                    execSync(`tesseract "${imagePath}" "${outputFile}" -l chi_sim+chi_tra+eng --psm 6`, {
                        stdio: 'pipe'
                    });
                    
                    if (fs.existsSync(outputFile + '.txt')) {
                        ocrText = fs.readFileSync(outputFile + '.txt', 'utf8');
                    }
                } catch (ocrError) {
                    console.log(`⚠️  中文OCR失败，尝试英文: ${ocrError.message}`);
                    try {
                        execSync(`tesseract "${imagePath}" "${outputFile}" -l eng --psm 6`, {
                            stdio: 'pipe'
                        });
                        if (fs.existsSync(outputFile + '.txt')) {
                            ocrText = fs.readFileSync(outputFile + '.txt', 'utf8');
                        }
                    } catch (engError) {
                        console.log(`❌ 英文OCR也失败: ${engError.message}`);
                        ocrText = `[OCR识别失败: ${engError.message}]`;
                    }
                }
                
                if (ocrText && ocrText.trim()) {
                    fullText += `=== 第 ${i + 1} 页 ===\n`;
                    fullText += ocrText + '\n\n';
                    console.log(`✅ 识别成功，文本长度: ${ocrText.length} 字符`);
                } else {
                    console.log('⚠️  没有识别到文本内容');
                    fullText += `=== 第 ${i + 1} 页 ===\n`;
                    fullText += '[没有识别到文本内容]\n\n';
                }
                
            } catch (error) {
                console.log(`❌ 处理第 ${i + 1} 页时出错:`, error.message);
                fullText += `=== 第 ${i + 1} 页 ===\n`;
                fullText += `[处理错误: ${error.message}]\n\n`;
            }
        }
        
        // 保存完整的文本内容
        if (fullText.trim()) {
            fs.writeFileSync(outputPath, fullText, 'utf8');
            console.log('🎉 OCR处理完成！');
            console.log('📁 输出文件:', outputPath);
            console.log('📝 总文本长度:', fullText.length, '字符');
            
            // 显示文本预览
            console.log('\n📋 文本预览:');
            console.log('-'.repeat(50));
            const preview = fullText.substring(0, 300);
            console.log(preview + (fullText.length > 300 ? '...' : ''));
            console.log('-'.repeat(50));
            
            return {
                success: true,
                totalPages: imageFiles.length,
                textLength: fullText.length,
                outputPath: outputPath
            };
        } else {
            throw new Error('没有识别到任何文本内容');
        }
        
    } catch (error) {
        console.log('❌ OCR处理过程中出错:', error.message);
        
        return {
            success: false,
            reason: 'ocr_error',
            error: error.message
        };
    }
}

// 主函数
async function main() {
    const pdfPath = process.argv[2] || '中国古代名句辞典(修订本).1_副本.pdf';
    const outputPath = process.argv[3] || './ocr-output/ancient-text-ocr.txt';
    
    if (!fs.existsSync(pdfPath)) {
        console.log('❌ PDF文件不存在:', pdfPath);
        console.log('💡 请提供正确的PDF文件路径');
        return;
    }
    
    console.log('='.repeat(60));
    console.log('🔍 PDF OCR处理工具');
    console.log('='.repeat(60));
    
    const result = await extractPDFWithOCR(pdfPath, outputPath);
    
    console.log('\n📊 处理结果:');
    console.log('- 成功:', result.success);
    
    if (result.success) {
        console.log('- 处理页数:', result.totalPages);
        console.log('- 文本长度:', result.textLength + ' 字符');
        console.log('- 输出文件:', result.outputPath);
    } else {
        console.log('- 失败原因:', result.reason);
        if (result.error) {
            console.log('- 错误信息:', result.error);
        }
    }
    
    console.log('='.repeat(60));
}

// 执行
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { extractPDFWithOCR };