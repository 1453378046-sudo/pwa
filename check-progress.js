const fs = require('fs');
const path = require('path');

function checkOCRProgress() {
    const outputDir = './ocr-output';
    const imagesDir = path.join(outputDir, 'images');
    
    try {
        // 检查输出目录是否存在
        if (!fs.existsSync(outputDir)) {
            console.log('📊 OCR处理尚未开始或输出目录不存在');
            return;
        }
        
        // 检查图像目录
        if (fs.existsSync(imagesDir)) {
            const imageFiles = fs.readdirSync(imagesDir)
                .filter(file => file.endsWith('.png'));
            
            console.log(`🖼️  已生成 ${imageFiles.length} 张图像`);
            
            // 检查文本文件
            const txtFiles = fs.readdirSync(imagesDir)
                .filter(file => file.endsWith('.txt'));
            
            console.log(`📝 已OCR识别 ${txtFiles.length} 页`);
            
            if (txtFiles.length > 0) {
                // 显示最近处理的几页
                const recentFiles = txtFiles.slice(-5);
                console.log('🔍 最近处理的页面:');
                recentFiles.forEach(file => {
                    const filePath = path.join(imagesDir, file);
                    const content = fs.readFileSync(filePath, 'utf8');
                    console.log(`   ${file}: ${content.length} 字符`);
                });
            }
        }
        
        // 检查最终输出文件
        const finalOutput = path.join(outputDir, 'ancient-text-complete.txt');
        if (fs.existsSync(finalOutput)) {
            const stats = fs.statSync(finalOutput);
            const content = fs.readFileSync(finalOutput, 'utf8');
            console.log('🎉 最终输出文件:');
            console.log(`   📁 文件大小: ${stats.size} 字节`);
            console.log(`   📝 文本长度: ${content.length} 字符`);
            console.log(`   🔍 内容预览:`);
            console.log('-'.repeat(50));
            console.log(content.substring(0, 200) + (content.length > 200 ? '...' : ''));
            console.log('-'.repeat(50));
        }
        
    } catch (error) {
        console.log('❌ 检查进度时出错:', error.message);
    }
}

// 每10秒检查一次进度
console.log('⏰ 开始监控OCR处理进度...');
console.log('💡 按 Ctrl+C 停止监控');

const interval = setInterval(checkOCRProgress, 10000);

// 处理Ctrl+C
process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n🛑 停止进度监控');
    process.exit(0);
});

// 立即检查一次
checkOCRProgress();