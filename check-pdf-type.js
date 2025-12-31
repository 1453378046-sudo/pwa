const fs = require('fs');

// 简单检查PDF文件头
function checkPDFType() {
    try {
        console.log('🔍 检查PDF文件类型...');
        
        // 读取文件前1024字节
        const buffer = Buffer.alloc(1024);
        const fd = fs.openSync('中国古代名句辞典(修订本).1_副本.pdf', 'r');
        fs.readSync(fd, buffer, 0, 1024, 0);
        fs.closeSync(fd);
        
        const header = buffer.toString('utf8', 0, 100);
        console.log('文件头:', header);
        
        // 检查是否是PDF文件
        if (buffer.toString('utf8', 0, 5) === '%PDF-') {
            console.log('✅ 这是一个有效的PDF文件');
            
            // 检查文件大小
            const stats = fs.statSync('中国古代名句辞典(修订本).1_副本.pdf');
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log('文件大小:', fileSizeMB, 'MB');
            
            // 基于文件大小的初步判断
            if (stats.size > 50 * 1024 * 1024) { // 大于50MB
                console.log('📊 文件较大，可能是图像扫描PDF');
            } else {
                console.log('📊 文件大小正常，可能是文本PDF');
            }
            
            return true;
        } else {
            console.log('❌ 这不是一个有效的PDF文件');
            return false;
        }
        
    } catch (error) {
        console.error('检查PDF文件时出错:', error.message);
        return false;
    }
}

// 尝试使用简单的文本提取
function trySimpleTextExtraction() {
    try {
        console.log('\n📝 尝试简单文本提取...');
        
        // 使用strings命令提取文本（如果可用）
        const { execSync } = require('child_process');
        
        try {
            const result = execSync('strings "中国古代名句辞典(修订本).1_副本.pdf" | head -20', { 
                encoding: 'utf8',
                maxBuffer: 1024 * 1024 
            });
            
            if (result.trim()) {
                console.log('提取到的文本片段:');
                console.log('='.repeat(50));
                console.log(result);
                console.log('='.repeat(50));
                return true;
            } else {
                console.log('❌ 没有提取到文本内容');
                return false;
            }
            
        } catch (execError) {
            console.log('无法使用strings命令:', execError.message);
            
            // 尝试使用hexdump查看内容
            try {
                const hexResult = execSync('hexdump -C "中国古代名句辞典(修订本).1_副本.pdf" | head -10', {
                    encoding: 'utf8'
                });
                console.log('十六进制预览:');
                console.log(hexResult);
            } catch (hexError) {
                console.log('也无法使用hexdump');
            }
            
            return false;
        }
        
    } catch (error) {
        console.error('文本提取尝试失败:', error.message);
        return false;
    }
}

// 主函数
function main() {
    console.log('📖 分析PDF文件: 中国古代名句辞典(修订本).1_副本.pdf');
    console.log('='.repeat(60));
    
    const isPDF = checkPDFType();
    
    if (isPDF) {
        const hasText = trySimpleTextExtraction();
        
        if (!hasText) {
            console.log('\n💡 结论: 这个PDF很可能是图像扫描格式');
            console.log('💡 建议: 需要使用OCR技术来提取文字内容');
            console.log('💡 方案: 可以使用Tesseract OCR或在线OCR服务');
        } else {
            console.log('\n💡 结论: 这个PDF包含可提取的文本内容');
            console.log('💡 建议: 可以使用专业的PDF文本提取工具');
        }
    }
    
    console.log('\n🎯 下一步: 根据PDF类型选择合适的文字提取方案');
}

// 执行检查
main();