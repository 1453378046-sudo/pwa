// 解析还款数据的函数
export function parseRepaymentData(excelData) {
    // 存储解析后的还款计划数据
    const repaymentData = {
        loans: [],
        creditCards: []
    };

    const parseNumber = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        const text = String(value ?? '').trim();
        if (!text) return 0;
        const cleaned = text.replace(/[^\d.-]/g, '');
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : 0;
    };

    const parseDayOfMonth = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.min(31, Math.floor(value)));
        const text = String(value ?? '').trim();
        if (!text) return 1;
        const cleaned = text.replace(/[^\d]/g, '');
        const day = parseInt(cleaned, 10);
        return Number.isFinite(day) ? Math.max(1, Math.min(31, day)) : 1;
    };
    
    for (let i = 0; i < excelData.length; i++) {
        const row = excelData[i];
        
        // 查找借款平台信息（包含"借款"字段且值不为"待还"、"11月"等统计或月份数据）
        if (row.借款 && typeof row.借款 === 'string' && 
            !row.借款.includes('待还') && 
            !row.借款.includes('月') && 
            !row.借款.includes('拼多多') && 
            row.借款 !== '平台') {
            
            // 解析还款日期（通常在__EMPTY_1字段）
            const dueDate = parseDayOfMonth(row.__EMPTY_1 ?? row['还款日'] ?? row['还款日期'] ?? row.dueDate);
            
            // 解析总待还金额（通常在__EMPTY_2字段）
            const totalAmount = parseNumber(row.__EMPTY_2 ?? row['总待还'] ?? row['总金额'] ?? row.totalAmount);
            
            // 解析当前余额（通常在__EMPTY_5字段）
            const balance = parseNumber(row.__EMPTY_5 ?? row['剩余'] ?? row['剩余金额'] ?? row.balance);
            
            // 解析月还款额（通常在__EMPTY_6字段）
            const monthlyPayment = parseNumber(row.__EMPTY_6 ?? row['月还款'] ?? row['月还款额'] ?? row.monthlyPayment);
            
            // 创建贷款对象
            const loan = {
                id: repaymentData.loans.length + 1,
                name: row.借款,
                type: 'personal',
                totalAmount: totalAmount,
                balance: balance,
                monthlyPayment: monthlyPayment,
                interestRate: 0, // Excel中没有利率信息
                startDate: '2024-01-01', // 默认开始日期
                endDate: '2025-01-01', // 默认结束日期
                dueDate: dueDate
            };
            
            repaymentData.loans.push(loan);
        }
    }

    // 特殊处理京东借钱的多笔借款
    const jingdongLoan = repaymentData.loans.find(loan => loan.name === '京东借钱');
    if (jingdongLoan) {
        // 从Excel数据中查找京东借钱的多笔借款信息
        const jingdongRows = excelData.filter(row => 
            row.__EMPTY && typeof row.__EMPTY === 'string' && 
            row.__EMPTY.includes('第') && row.__EMPTY.includes('笔')
        );
        
        jingdongRows.forEach((row, index) => {
            const totalAmount = row.__EMPTY_3 ? parseFloat(row.__EMPTY_3.replace(/[^\d.]/g, '')) : 0;
            const balance = row.__EMPTY_5 ? parseFloat(row.__EMPTY_5) : 0;
            const monthlyPayment = row.__EMPTY_6 ? parseFloat(row.__EMPTY_6) : 0;
            
            const loan = {
                id: repaymentData.loans.length + 1,
                name: `京东借钱-${row.__EMPTY}`,
                type: 'personal',
                totalAmount: totalAmount,
                balance: balance,
                monthlyPayment: monthlyPayment,
                interestRate: 0,
                startDate: '2024-01-01',
                endDate: '2025-01-01',
                dueDate: jingdongLoan.dueDate
            };
            
            repaymentData.loans.push(loan);
        });
        
        // 移除原始的京东借钱记录
        repaymentData.loans = repaymentData.loans.filter(loan => loan.id !== jingdongLoan.id);
    }

    return repaymentData;
}

// 从JSON文件加载还款数据
export async function loadRepaymentJSON() {
    try {
        const response = await fetch('/repayment_data.json');
        if (!response.ok) {
            throw new Error('无法加载还款数据文件');
        }
        const data = await response.json();
        return parseRepaymentData(data);
    } catch (error) {
        console.error('加载还款数据失败:', error);
        // 返回默认空数据
        return {
            loans: [],
            creditCards: []
        };
    }
}
