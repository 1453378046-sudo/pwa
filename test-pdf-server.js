const http = require('http');
const fs = require('fs');

// 测试PDF文件服务
function testPDFServer() {
    console.log('🔍 测试PDF文件服务...');
    
    const options = {
        hostname: 'localhost',
        port: 8080,
        path: '/%E4%B8%AD%E5%9B%BD%E5%8F%A4%E4%BB%A3%E5%90%8D%E5%8F%A5%E8%BE%9E%E5%85%B8(%E4%BF%AE%E8%AE%A2%E6%9C%AC).1_%E5%89%AF%E6%9C%AC.pdf',
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        console.log(`📊 响应状态码: ${res.statusCode}`);
        console.log(`📋 响应头: ${JSON.stringify(res.headers, null, 2)}`);
        
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            console.log(`📏 响应数据长度: ${data.length} 字节`);
            if (res.statusCode === 200) {
                console.log('✅ PDF文件服务正常！');
            } else {
                console.log('❌ PDF文件服务异常！');
            }
        });
    });

    req.on('error', (error) => {
        console.log('❌ 请求错误:', error.message);
    });

    req.end();
}

// 等待服务器启动
setTimeout(testPDFServer, 1000);