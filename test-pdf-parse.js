const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function testPDFParse() {
    try {
        console.log('📄 测试PDF解析...');
        
        const dataBuffer = fs.readFileSync('中国古代名句辞典(修订本).1_副本.pdf');
        console.log('📊 文件大小:', dataBuffer.length, 'bytes');
        
        const parser = new PDFParse({ data: dataBuffer });
        const data = await parser.getText();
        
        console.log('✅ 解析完成');
        console.log('📋 数据结构:', Object.keys(data));
        
        if (data.text) {
            console.log('📝 文本长度:', data.text.length);
            console.log('🔍 文本预览:');
            console.log('-'.repeat(50));
            console.log(data.text.substring(0, 200));
            console.log('-'.repeat(50));
            
            // 保存文本
            fs.writeFileSync('./test-output.txt', data.text, 'utf8');
            console.log('💾 文本已保存到 test-output.txt');
        } else {
            console.log('❌ 没有提取到文本内容');
        }
        
        if (data.numpages) {
            console.log('📄 页面数量:', data.numpages);
        }
        
    } catch (error) {
        console.log('❌ 错误:', error.message);
        console.log('💡 错误详情:', error);
    }
}

testPDFParse();