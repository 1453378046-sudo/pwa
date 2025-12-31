// 古籍OCR专用配置
module.exports = {
  // PDF处理配置 - 针对古籍优化
  pdf: {
    maxPages: 1123, // 最大页数
    dpi: 400, // 提高分辨率以更好识别古籍文字
    outputFormat: 'png', // 输出格式
    quality: 100 // 最高质量
  },
  
  // OCR引擎配置 - 古籍优化
  ocr: {
    engine: 'tesseract',
    languages: ['chi_sim', 'chi_tra'], // 简体中文 + 繁体中文
    tessdataPath: './tessdata',
    
    // Tesseract配置 - 古籍专用
    tesseract: {
      oem: 1, // LSTM引擎
      psm: 6, // 统一块文本
      
      // 古籍优化参数
      config: {
        'tessedit_pageseg_mode': '6',
        'tessedit_ocr_engine_mode': '1',
        'tessedit_char_whitelist': '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,!?;:()[]{}<>/\\|@#$%^&*_-+=~`"\'\u4e00-\u9fff\u3000-\u303f\uff00-\uffef',
        'tessedit_unrej_any_wd': 'true',
        'textord_heavy_nr': 'true',
        'tessedit_adaption_mode': '2',
        'tessedit_minimal_rejection': 'true',
        'tessedit_zero_rejection': 'true',
        'textord_debug_tabfind': '0',
        'classify_enable_learning': 'true',
        'classify_enable_adaptive_matcher': 'true',
        'textord_noise_rejwords': 'true',
        'textord_noise_syfract': '0.75'
      }
    }
  },
  
  // 图像预处理配置 - 古籍优化
  preprocessing: {
    enabled: true,
    steps: [
      'grayscale',    // 灰度化
      'denoise',       // 去噪（古籍常有噪点）
      'contrast',      // 对比度增强
      'binarization',  // 二值化
      'deskew',        // 倾斜校正
      'sharpen'        // 锐化（古籍文字边缘清晰化）
    ],
    
    parameters: {
      grayscale: {
        method: 'luminosity'
      },
      denoise: {
        method: 'median',
        kernelSize: 5       // 增大核大小以更好去噪
      },
      contrast: {
        method: 'histogram',
        alpha: 2.0,          // 增强对比度
        beta: 10            // 稍微增加亮度
      },
      binarization: {
        method: 'adaptive',  // 使用自适应二值化
        blockSize: 31,
        constant: 7
      },
      deskew: {
        maxAngle: 10        // 古籍可能倾斜更严重
      },
      sharpen: {
        method: 'unsharp',
        radius: 1.0,
        amount: 1.5,
        threshold: 0.05
      }
    }
  },
  
  // 批量处理配置
  batch: {
    maxConcurrent: 2,      // 降低并发数以提高稳定性
    batchSize: 5,         // 减小批次大小
    timeout: 60000,        // 延长超时时间（古籍处理较慢）
    retryAttempts: 5       // 增加重试次数
  },
  
  // 输出配置
  output: {
    directory: './output/ancient-text',
    formats: ['txt', 'json'],
    
    text: {
      preserveLayout: true,
      includePageNumbers: true,
      encoding: 'utf8',
      lineSeparator: '\n',
      pageSeparator: '\n=== 页面分隔符 ===\n'
    },
    
    json: {
      structured: true,
      includeConfidence: true,
      minConfidence: 0.5,  // 降低置信度阈值
      includeBoundingBox: true
    }
  },
  
  // 古籍特殊处理
  ancientText: {
    enabled: true,
    features: {
      traditionalChinese: true,
      sealScriptDetection: false,
      verticalText: true,   // 支持竖排文本
      rubyText: true,       // 支持注音
      punctuationCorrection: true // 标点符号校正
    },
    
    // 特殊字符处理
    specialCharacters: {
      whitelist: '\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\uf900-\ufaff\u{2f800}-\u{2fa1f}',
      customDictionary: './dictionaries/ancient-chinese.txt'
    }
  },
  
  // 性能监控
  performance: {
    logInterval: 10,        // 更频繁的日志输出
    metrics: ['accuracy', 'speed', 'memory', 'confidence'],
    
    // 古籍性能目标
    targets: {
      minAccuracy: 0.85,    // 最低准确率要求
      maxTimePerPage: 10000, // 每页最大处理时间(ms)
      minConfidence: 0.6     // 最低置信度
    }
  }
};