const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs').promises;

class OCRProcessor {
  constructor(config) {
    this.config = config.ocr;
    this.worker = null;
    this.initialized = false;
  }

  /**
   * 初始化OCR工作器
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      console.log('🔄 初始化Tesseract OCR引擎...');
      
      // 设置Tesseract数据路径
      if (this.config.tessdataPath) {
        Tesseract.setTessdataPath(this.config.tessdataPath);
      }

      // 创建工作器
      this.worker = await Tesseract.createWorker(
        this.config.languages.join('+'),
        this.config.tesseract.oem,
        {
          logger: m => this.handleLog(m),
          ...this.config.tesseract.config
        }
      );

      // 设置页面分割模式
      await this.worker.setParameters({
        tessedit_pageseg_mode: this.config.tesseract.psm.toString(),
        tessedit_ocr_engine_mode: this.config.tesseract.oem.toString()
      });

      this.initialized = true;
      console.log('✅ Tesseract OCR引擎初始化完成');
    } catch (error) {
      throw new Error(`OCR引擎初始化失败: ${error.message}`);
    }
  }

  /**
   * 处理日志信息
   */
  handleLog(message) {
    if (message.status === 'recognizing text') {
      process.stdout.write(`\rOCR进度: ${Math.round(message.progress * 100)}%`);
    } else if (message.status === 'done') {
      process.stdout.write('\n');
    }
  }

  /**
   * 识别单张图像中的文字
   */
  async recognizeImage(imageBuffer, pageNumber, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      console.log(`\n🔍 开始识别页面 ${pageNumber}...`);
      
      const startTime = Date.now();
      
      const result = await this.worker.recognize(imageBuffer, {
        rectangle: options.region // 可选：指定识别区域 {left, top, width, height}
      });

      const processingTime = Date.now() - startTime;
      
      console.log(`✅ 页面 ${pageNumber} 识别完成，耗时: ${processingTime}ms`);
      console.log(`   识别字符数: ${result.data.text.length}`);
      console.log(`   平均置信度: ${this.calculateAverageConfidence(result.data.confidence)}`);

      return {
        text: result.data.text,
        confidence: result.data.confidence,
        blocks: result.data.blocks,
        words: result.data.words,
        lines: result.data.lines,
        symbols: result.data.symbols,
        processingTime: processingTime,
        pageNumber: pageNumber,
        success: true
      };
    } catch (error) {
      console.error(`❌ 页面 ${pageNumber} 识别失败:`, error.message);
      return {
        text: '',
        confidence: 0,
        processingTime: 0,
        pageNumber: pageNumber,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 批量识别多张图像
   */
  async batchRecognize(images, concurrency = this.config.batch?.maxConcurrent || 2) {
    if (!this.initialized) {
      await this.initialize();
    }

    const results = [];
    const queue = [...images];
    
    // 创建并发处理
    const workers = Array(concurrency).fill().map(async (_, workerId) => {
      while (queue.length > 0) {
        const imageData = queue.shift();
        if (!imageData) continue;

        console.log(`👷 Worker ${workerId + 1} 处理页面 ${imageData.pageNumber}`);
        
        try {
          const result = await this.recognizeImage(
            imageData.buffer, 
            imageData.pageNumber
          );
          results.push(result);
        } catch (error) {
          console.error(`Worker ${workerId + 1} 处理页面 ${imageData.pageNumber} 失败:`, error.message);
          results.push({
            pageNumber: imageData.pageNumber,
            success: false,
            error: error.message
          });
        }
      }
    });

    await Promise.all(workers);
    return results.sort((a, b) => a.pageNumber - b.pageNumber);
  }

  /**
   * 计算平均置信度
   */
  calculateAverageConfidence(confidenceArray) {
    if (!confidenceArray || confidenceArray.length === 0) return 0;
    
    const validConfidences = confidenceArray.filter(conf => conf > 0);
    if (validConfidences.length === 0) return 0;
    
    return validConfidences.reduce((sum, conf) => sum + conf, 0) / validConfidences.length;
  }

  /**
   * 处理古籍特殊字符
   */
  processAncientCharacters(text, pageNumber) {
    // 古籍字符后处理
    let processedText = text;
    
    // 常见古籍字符替换
    const characterMap = {
      '⿰': '',
      '⿱': '',
      '⿲': '',
      '⿳': '',
      '⿴': '',
      '⿵': '',
      '⿶': '',
      '⿷': '',
      '⿸': '',
      '⿹': '',
      '⿺': '',
      '⿻': ''
    };
    
    Object.entries(characterMap).forEach(([oldChar, newChar]) => {
      processedText = processedText.replace(new RegExp(oldChar, 'g'), newChar);
    });

    // 去除多余空格和换行
    processedText = processedText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return processedText;
  }

  /**
   * 分析识别结果质量
   */
  analyzeResultQuality(results) {
    const totalPages = results.length;
    const successfulPages = results.filter(r => r.success).length;
    const failedPages = totalPages - successfulPages;
    
    const confidences = results
      .filter(r => r.success && r.confidence)
      .flatMap(r => r.confidence)
      .filter(conf => conf > 0);
    
    const avgConfidence = confidences.length > 0 
      ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length 
      : 0;

    const totalChars = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.text?.length || 0), 0);

    const totalTime = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.processingTime || 0), 0);

    return {
      totalPages,
      successfulPages,
      failedPages,
      successRate: (successfulPages / totalPages) * 100,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      totalChars,
      avgCharsPerPage: totalChars / successfulPages || 0,
      totalProcessingTime: totalTime,
      avgProcessingTime: totalTime / successfulPages || 0
    };
  }

  /**
   * 生成质量报告
   */
  generateQualityReport(results, outputPath = null) {
    const quality = this.analyzeResultQuality(results);
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalPagesProcessed: quality.totalPages,
        successfulRecognitions: quality.successfulPages,
        recognitionSuccessRate: `${quality.successRate.toFixed(2)}%`,
        averageConfidence: `${quality.avgConfidence.toFixed(2)}%`,
        totalCharacters: quality.totalChars,
        averageCharactersPerPage: Math.round(quality.avgCharsPerPage),
        totalProcessingTime: `${(quality.totalProcessingTime / 1000).toFixed(2)}s`,
        averageTimePerPage: `${(quality.avgProcessingTime / 1000).toFixed(2)}s`
      },
      detailedResults: results.map(result => ({
        pageNumber: result.pageNumber,
        success: result.success,
        characterCount: result.text?.length || 0,
        averageConfidence: result.confidence 
          ? (this.calculateAverageConfidence(result.confidence) * 100).toFixed(2) + '%'
          : 'N/A',
        processingTime: result.processingTime ? `${result.processingTime}ms` : 'N/A',
        error: result.error || null
      }))
    };

    if (outputPath) {
      fs.writeFile(outputPath, JSON.stringify(report, null, 2));
      console.log(`📊 质量报告已保存到: ${outputPath}`);
    }

    return report;
  }

  /**
   * 终止OCR工作器
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.initialized = false;
      console.log('OCR工作器已终止');
    }
  }

  /**
   * 重新初始化OCR工作器（解决内存泄漏问题）
   */
  async reinitialize() {
    await this.terminate();
    await this.initialize();
  }
}

module.exports = OCRProcessor;