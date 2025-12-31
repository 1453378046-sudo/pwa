const async = require('async');
const fs = require('fs').promises;
const path = require('path');
const ProgressBar = require('progress');
const chalk = require('chalk');

class BatchProcessor {
  constructor(config, modules) {
    this.config = config;
    this.modules = modules;
    this.progressBar = null;
    this.metrics = {
      startTime: null,
      totalPages: 0,
      processedPages: 0,
      successfulPages: 0,
      failedPages: 0,
      totalProcessingTime: 0,
      memoryUsage: []
    };
  }

  /**
   * 批量处理PDF文件
   */
  async processPDF(pdfBuffer, options = {}) {
    this.metrics.startTime = Date.now();
    
    try {
      console.log(chalk.blue('🚀 开始批量处理PDF文件'));
      
      // 初始化PDF提取器
      const pdfExtractor = new this.modules.PDFExtractor(this.config);
      const totalPages = await pdfExtractor.initialize(pdfBuffer);
      
      this.metrics.totalPages = totalPages;
      
      // 获取PDF元数据
      const metadata = await pdfExtractor.getMetadata();
      console.log(chalk.gray(`  文件信息: ${metadata.title || '未知标题'}, ${totalPages} 页`));
      console.log(chalk.gray(`  类型: ${metadata.isPureImage ? '图像PDF' : '文本PDF'}`));
      
      // 创建进度条
      this.createProgressBar(totalPages);
      
      // 批量处理页面
      const results = await this.processPagesInBatches(
        pdfExtractor, 
        totalPages, 
        options
      );
      
      // 关闭PDF提取器
      await pdfExtractor.close();
      
      // 生成最终报告
      await this.generateFinalReport(results, metadata);
      
      console.log(chalk.green('✅ 批量处理完成!'));
      
      return {
        success: true,
        results: results,
        metrics: this.metrics,
        metadata: metadata
      };
      
    } catch (error) {
      console.error(chalk.red('❌ 批量处理失败:'), error.message);
      return {
        success: false,
        error: error.message,
        metrics: this.metrics
      };
    }
  }

  /**
   * 分批次处理页面
   */
  async processPagesInBatches(pdfExtractor, totalPages, options) {
    const batchSize = this.config.batch.batchSize;
    const maxConcurrent = this.config.batch.maxConcurrent;
    const allResults = [];
    
    // 创建处理队列
    const queue = async.queue(async (batchInfo, callback) => {
      try {
        const results = await this.processBatch(
          pdfExtractor, 
          batchInfo.startPage, 
          batchInfo.endPage
        );
        
        allResults.push(...results);
        callback(null, results);
        
      } catch (error) {
        console.error(chalk.red(`❌ 批次 ${batchInfo.batchNumber} 处理失败:`), error.message);
        callback(error);
      }
    }, maxConcurrent);

    // 生成批次信息
    const batches = [];
    for (let startPage = 1; startPage <= totalPages; startPage += batchSize) {
      const endPage = Math.min(startPage + batchSize - 1, totalPages);
      batches.push({
        batchNumber: Math.ceil(startPage / batchSize),
        startPage: startPage,
        endPage: endPage,
        pageCount: endPage - startPage + 1
      });
    }

    console.log(chalk.blue(`📦 共 ${batches.length} 个批次，每批 ${batchSize} 页`));
    
    // 处理所有批次
    return new Promise((resolve, reject) => {
      queue.drain(() => {
        resolve(allResults.flat());
      });

      queue.error((error) => {
        console.error(chalk.red('队列处理错误:'), error);
        reject(error);
      });

      // 添加所有批次到队列
      batches.forEach(batchInfo => {
        queue.push(batchInfo);
      });
    });
  }

  /**
   * 处理单个批次
   */
  async processBatch(pdfExtractor, startPage, endPage) {
    const batchNumber = Math.ceil(startPage / this.config.batch.batchSize);
    
    console.log(chalk.yellow(`\n🔄 处理批次 ${batchNumber}: 页面 ${startPage}-${endPage}`));
    
    try {
      // 提取页面图像
      const images = await pdfExtractor.extractPagesAsImages(
        startPage, 
        endPage, 
        './temp'
      );
      
      // 预处理图像
      const preprocessor = new this.modules.ImagePreprocessor(this.config);
      const processedImages = await preprocessor.batchPreprocess(images);
      
      // OCR识别
      const ocrProcessor = new this.modules.OCRProcessor(this.config);
      await ocrProcessor.initialize();
      const ocrResults = await ocrProcessor.batchRecognize(processedImages);
      
      // 处理结果
      const outputProcessor = new this.modules.OutputProcessor(this.config);
      const outputs = await outputProcessor.processResults(ocrResults);
      
      // 更新指标
      this.updateMetrics(ocrResults, images.length);
      
      // 清理临时文件
      await pdfExtractor.cleanup('./temp');
      
      // 定期重新初始化OCR处理器（防止内存泄漏）
      if (this.metrics.processedPages % 100 === 0) {
        await ocrProcessor.reinitialize();
      }
      
      await ocrProcessor.terminate();
      
      return ocrResults;
      
    } catch (error) {
      console.error(chalk.red(`❌ 批次 ${batchNumber} 处理失败:`), error.message);
      
      // 返回失败结果
      return Array.from({ length: endPage - startPage + 1 }, (_, i) => ({
        pageNumber: startPage + i,
        success: false,
        error: error.message
      }));
    }
  }

  /**
   * 创建进度条
   */
  createProgressBar(totalPages) {
    this.progressBar = new ProgressBar('🔄 处理进度 [:bar] :percent :etas', {
      complete: '=',
      incomplete: ' ',
      width: 40,
      total: totalPages
    });
  }

  /**
   * 更新进度和指标
   */
  updateMetrics(results, batchSize) {
    const successful = results.filter(r => r.success).length;
    const failed = batchSize - successful;
    
    this.metrics.processedPages += batchSize;
    this.metrics.successfulPages += successful;
    this.metrics.failedPages += failed;
    
    // 更新进度条
    if (this.progressBar) {
      this.progressBar.tick(batchSize);
    }
    
    // 记录内存使用情况
    this.recordMemoryUsage();
    
    // 定期输出状态
    if (this.metrics.processedPages % this.config.output.performance.logInterval === 0) {
      this.printStatusUpdate();
    }
  }

  /**
   * 记录内存使用情况
   */
  recordMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    this.metrics.memoryUsage.push({
      timestamp: Date.now(),
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external
    });
  }

  /**
   * 打印状态更新
   */
  printStatusUpdate() {
    const elapsed = (Date.now() - this.metrics.startTime) / 1000;
    const pagesPerSecond = this.metrics.processedPages / elapsed;
    const estimatedTotal = this.metrics.totalPages / pagesPerSecond;
    const remaining = estimatedTotal - elapsed;
    
    const memory = process.memoryUsage();
    const memoryMB = (memory.heapUsed / 1024 / 1024).toFixed(2);
    
    console.log(chalk.gray(`
    📊 状态更新:
      已处理: ${this.metrics.processedPages}/${this.metrics.totalPages} 页
      成功率: ${((this.metrics.successfulPages / this.metrics.processedPages) * 100).toFixed(1)}%
      速度: ${pagesPerSecond.toFixed(2)} 页/秒
      预计剩余: ${Math.ceil(remaining)} 秒
      内存使用: ${memoryMB} MB
    `));
  }

  /**
   * 生成最终报告
   */
  async generateFinalReport(results, metadata) {
    const totalTime = (Date.now() - this.metrics.startTime) / 1000;
    const successRate = (this.metrics.successfulPages / this.metrics.totalPages) * 100;
    
    const report = {
      summary: {
        totalProcessingTime: `${totalTime.toFixed(2)} 秒`,
        averageTimePerPage: `${(totalTime / this.metrics.totalPages).toFixed(2)} 秒`,
        pagesPerSecond: `${(this.metrics.totalPages / totalTime).toFixed(2)}`,
        successRate: `${successRate.toFixed(2)}%`,
        totalPages: this.metrics.totalPages,
        successfulPages: this.metrics.successfulPages,
        failedPages: this.metrics.failedPages,
        startTime: new Date(this.metrics.startTime).toLocaleString(),
        endTime: new Date().toLocaleString()
      },
      performance: {
        memoryUsage: this.analyzeMemoryUsage(),
        throughput: this.calculateThroughput(),
        bottlenecks: this.identifyBottlenecks()
      },
      fileInfo: metadata,
      recommendations: this.generateRecommendations(successRate)
    };

    // 保存报告
    const reportPath = path.join(this.config.output.directory, 'performance-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(chalk.green('📊 性能报告已保存!'));
    
    // 打印摘要
    this.printSummary(report);
  }

  /**
   * 分析内存使用情况
   */
  analyzeMemoryUsage() {
    if (this.metrics.memoryUsage.length === 0) return {};
    
    const lastUsage = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
    const maxUsage = this.metrics.memoryUsage.reduce((max, usage) => ({
      rss: Math.max(max.rss, usage.rss),
      heapTotal: Math.max(max.heapTotal, usage.heapTotal),
      heapUsed: Math.max(max.heapUsed, usage.heapUsed)
    }), { rss: 0, heapTotal: 0, heapUsed: 0 });

    return {
      current: {
        rss: `${(lastUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(lastUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`
      },
      peak: {
        rss: `${(maxUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(maxUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`
      }
    };
  }

  /**
   * 计算吞吐量
   */
  calculateThroughput() {
    const totalTime = (Date.now() - this.metrics.startTime) / 1000;
    return {
      pagesPerSecond: (this.metrics.totalPages / totalTime).toFixed(2),
      charactersPerSecond: (this.metrics.successfulPages * 1000 / totalTime).toFixed(2), // 估计值
      totalThroughput: this.metrics.totalPages
    };
  }

  /**
   * 识别性能瓶颈
   */
  identifyBottlenecks() {
    // 简化实现
    return [
      '建议增加并发处理数以提高吞吐量',
      '考虑使用更高效的图像预处理算法',
      '优化OCR参数配置以提高识别速度'
    ];
  }

  /**
   * 生成优化建议
   */
  generateRecommendations(successRate) {
    const recommendations = [];
    
    if (successRate < 90) {
      recommendations.push('识别准确率较低，建议：优化图像预处理参数、使用更高分辨率的扫描');
    }
    
    if (this.metrics.memoryUsage.some(usage => usage.heapUsed > 500 * 1024 * 1024)) {
      recommendations.push('内存使用较高，建议：减小批次大小、增加内存限制');
    }
    
    return recommendations.length > 0 ? recommendations : ['性能良好，无需重大优化'];
  }

  /**
   * 打印处理摘要
   */
  printSummary(report) {
    console.log(chalk.blue('\n📈 处理摘要:'));
    console.log(chalk.gray('  总耗时:'), chalk.white(report.summary.totalProcessingTime));
    console.log(chalk.gray('  平均每页:'), chalk.white(report.summary.averageTimePerPage));
    console.log(chalk.gray('  处理速度:'), chalk.white(report.summary.pagesPerSecond + ' 页/秒'));
    console.log(chalk.gray('  成功率:'), 
      report.summary.successRate >= 95 ? chalk.green(report.summary.successRate + '%') :
      report.summary.successRate >= 80 ? chalk.yellow(report.summary.successRate + '%') :
      chalk.red(report.summary.successRate + '%')
    );
    console.log(chalk.gray('  内存峰值:'), chalk.white(report.performance.memoryUsage.peak.heapUsed));
  }

  /**
   * 处理多个PDF文件
   */
  async processMultiplePDFs(pdfFiles, options = {}) {
    const results = [];
    
    for (const [index, pdfFile] of pdfFiles.entries()) {
      console.log(chalk.blue(`\n📄 处理文件 ${index + 1}/${pdfFiles.length}: ${pdfFile.name}`));
      
      try {
        const result = await this.processPDF(pdfFile.buffer, options);
        results.push({
          file: pdfFile.name,
          ...result
        });
      } catch (error) {
        console.error(chalk.red(`❌ 文件 ${pdfFile.name} 处理失败:`), error.message);
        results.push({
          file: pdfFile.name,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }
}

module.exports = BatchProcessor;