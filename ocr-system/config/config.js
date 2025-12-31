// OCR系统配置
module.exports = {
  // PDF处理配置
  pdf: {
    maxPages: 1123, // 最大页数
    dpi: 300, // 图像分辨率
    outputFormat: 'png', // 输出格式
    quality: 95 // 图像质量
  },
  
  // OCR引擎配置
  ocr: {
    engine: 'tesseract', // 使用的OCR引擎
    languages: ['chi_sim', 'chi_tra'], // 支持的语言：简体中文、繁体中文
    tessdataPath: './tessdata', // Tesseract数据路径
    
    // Tesseract配置
    tesseract: {
      oem: 1, // OCR引擎模式: 0 = 传统引擎, 1 = LSTM引擎, 2 = 传统+LSTM, 3 = 默认
      psm: 6, // 页面分割模式: 6 = 统一块文本, 8 = 单字, 13 = 原始行
      
      // 性能优化参数
      config: {
        'tessedit_pageseg_mode': '6',
        'tessedit_ocr_engine_mode': '1',
        'tessedit_char_whitelist': '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,!?;:()[]{}<>/\\|@#$%^&*_-+=~`\"\'\u4e00-\u9fff',
        'tessedit_unrej_any_wd': 'true',
        'textord_heavy_nr': 'true',
        'tessedit_adaption_mode': '2'
      }
    }
  },
  
  // 图像预处理配置
  preprocessing: {
    enabled: true,
    steps: [
      'grayscale',    // 灰度化
      'denoise',       // 去噪
      'contrast',      // 对比度增强
      'binarization',  // 二值化
      'deskew'         // 倾斜校正
    ],
    
    // 各步骤参数
    parameters: {
      grayscale: {
        method: 'luminosity' // 灰度化方法: luminosity, average, lightness
      },
      denoise: {
        method: 'median',   // 去噪方法: median, gaussian, bilateral
        kernelSize: 3       // 核大小
      },
      contrast: {
        method: 'histogram', // 对比度增强方法: histogram, linear
        alpha: 1.5,          // 对比度系数
        beta: 0             // 亮度系数
      },
      binarization: {
        method: 'otsu',     // 二值化方法: otsu, adaptive
        blockSize: 15,
        constant: 5
      },
      deskew: {
        maxAngle: 5        // 最大倾斜角度
      }
    }
  },
  
  // 批量处理配置
  batch: {
    maxConcurrent: 4,      // 最大并发处理数
    batchSize: 10,         // 每批处理页数
    timeout: 30000,        // 单页处理超时时间(ms)
    retryAttempts: 3       // 重试次数
  },
  
  // 输出配置
  output: {
    directory: './output',
    formats: ['txt', 'json', 'html'],
    
    // 文本输出配置
    text: {
      preserveLayout: true,    // 保留布局
      includePageNumbers: true, // 包含页码
      encoding: 'utf8'
    },
    
    // JSON输出配置
    json: {
      structured: true,       // 结构化输出
      includeConfidence: true, // 包含置信度
      minConfidence: 0.6      // 最小置信度阈值
    },
    
    // 性能监控
    performance: {
      logInterval: 100,       // 日志间隔页数
      metrics: ['accuracy', 'speed', 'memory']
    }
  },
  
  // 古籍特殊处理
  ancientText: {
    enabled: true,
    features: {
      traditionalChinese: true,  // 繁体中文支持
      sealScriptDetection: false, // 篆书检测
      verticalText: true,        // 竖排文本支持
      rubyText: true             // 注音文本支持
    },
    
    // 特殊字符处理
    specialCharacters: {
      whitelist: '\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{f900}-\ufaff\u{2f800}-\u{2fa1f}',
      customDictionary: './dictionaries/ancient-chinese.txt'
    }
  }
};