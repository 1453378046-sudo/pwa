const XLSX = require('xlsx');
const fs = require('fs');

// 读取Excel文件
const workbook = XLSX.readFile('./借款.xlsx');

// 获取第一个工作表
const worksheet = workbook.Sheets[workbook.SheetNames[0]];

// 将工作表转换为JSON数据
const data = XLSX.utils.sheet_to_json(worksheet);

// 打印数据
console.log('Excel文件内容:');
console.log(JSON.stringify(data, null, 2));

// 写入到JSON文件，方便查看
fs.writeFileSync('./repayment_data.json', JSON.stringify(data, null, 2));
console.log('\n数据已保存到repayment_data.json文件');
