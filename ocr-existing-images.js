const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function ocrExistingImages(imagesDir, outputPath) {
    console.log('🔍 开始对现有图像进行OCR识别...');
    console.log('📁 图像目录:', imagesDir);
    
    try {
        // 检查图像目录是否存在
        if (!fs.existsSync(imagesDir)) {
            throw new Error('图像目录不存在');
        }
        
        // 获取所有PNG图像文件
        const imageFiles = fs.readdirSync(imagesDir)
            .filter(file => file.endsWith('.png'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/page-?(\d+)/)?.[1] || '0');
                const numB = parseInt(b.match(/page-?(\d+)/)?.[1] || '0');
                return numA - numB;
            });
        
        console.log(`📊 找到 ${imageFiles.length} 张图像`);
        
        if (imageFiles.length === 0) {
            throw new Error('没有找到任何PNG图像文件');
        }
        
        // 创建输出目录
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // 对每张图像进行OCR识别
        console.log('🔤 开始OCR识别...');
        let fullText = '';
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < imageFiles.length; i++) {
            const imageFile = imageFiles[i];
            const imagePath = path.join(imagesDir, imageFile);
            
            // 提取页码
            const pageMatch = imageFile.match(/page-?(\d+)/);
            const pageNumber = pageMatch ? parseInt(pageMatch[1]) : i + 1;
            
            console.log(`📄 处理第 ${pageNumber}/${imageFiles.length} 页: ${imageFile}`);
            
            try {
                // 使用tesseract进行OCR识别
                const outputFile = path.join(imagesDir, `ocr_page_${pageNumber}.txt`);
                
                // 尝试简体中文和繁体中文识别
                let ocrText = '';
                let ocrSuccess = false;
                
                try {
                    execSync(`tesseract "${imagePath}" "${outputFile}" -l chi_sim+chi_tra+eng --psm 6`, {
                        stdio: 'pipe'
                    });
                    
                    if (fs.existsSync(outputFile + '.txt')) {
                        ocrText = fs.readFileSync(outputFile + '.txt', 'utf8');
                        ocrSuccess = true;
                    }
                } catch (ocrError) {
                    console.log(`⚠️  中文OCR失败，尝试英文: ${ocrError.message}`);
                    try {
                        execSync(`tesseract "${imagePath}" "${outputFile}" -l eng --psm 6`, {
                            stdio: 'pipe'
                        });
                        if (fs.existsSync(outputFile + '.txt')) {
                            ocrText = fs.readFileSync(outputFile + '.txt', 'utf8');
                            ocrSuccess = true;
                        }
                    } catch (engError) {
                        console.log(`❌ 英文OCR也失败: ${engError.message}`);
                        ocrText = `[OCR识别失败: ${engError.message}]`;
                    }
                }
                
                if (ocrSuccess && ocrText && ocrText.trim()) {
                    fullText += `=== 第 ${pageNumber} 页 ===\n`;
                    fullText += ocrText + '\n\n';
                    console.log(`✅ 识别成功，文本长度: ${ocrText.length} 字符`);
                    successCount++;
                } else {
                    console.log('⚠️  没有识别到文本内容');
                    fullText += `=== 第 ${pageNumber} 页 ===\n`;
                    fullText += '[没有识别到文本内容]\n\n';
                    failCount++;
                }
                
            } catch (error) {
                console.log(`❌ 处理第 ${pageNumber} 页时出错:`, error.message);
                fullText += `=== 第 ${pageNumber} 页 ===\n`;
                fullText += `[处理错误: ${error.message}]\n\n`;
                failCount++;
            }
            
            // 每处理10页显示一次进度
            if ((i + 1) % 10 === 0 || i === imageFiles.length - 1) {
                console.log(`📊 进度: ${i + 1}/${imageFiles.length} (${Math.round((i + 1) / imageFiles.length * 100)}%)`);
                console.log(`✅ 成功: ${successCount}, ❌ 失败: ${failCount}`);
            }
        }
        
        // 保存完整的文本内容
        if (fullText.trim()) {
            fs.writeFileSync(outputPath, fullText, 'utf8');
            console.log('🎉 OCR处理完成！');
            console.log('📁 输出文件:', outputPath);
            console.log('📝 总文本长度:', fullText.length, '字符');
            console.log(`📊 统计: ✅ ${successCount} 页成功, ❌ ${failCount} 页失败`);
            
            // 显示文本预览
            console.log('\n📋 文本预览:');
            console.log('-'.repeat(50));
            const preview = fullText.substring(0, 300);
            console.log(preview + (fullText.length > 300 ? '...' : ''));
            console.log('-'.repeat(50));
            
            return {
                success: true,
                totalPages: imageFiles.length,
                successCount: successCount,
                failCount: failCount,
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
    const imagesDir = process.argv[2] || './ocr-output/images';
    const outputPath = process.argv[3] || './ocr-output/partial-text-ocr.txt';
    
    console.log('='.repeat(60));
    console.log('🔍 现有图像OCR处理工具');
    console.log('='.repeat(60));
    
    const result = await ocrExistingImages(imagesDir, outputPath);
    
    console.log('\n📊 处理结果:');
    console.log('- 成功:', result.success);
    
    if (result.success) {
        console.log('- 处理页数:', result.totalPages);
        console.log('- 成功页数:', result.successCount);
        console.log('- 失败页数:', result.failCount);
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

module.exports = { ocrExistingImages };