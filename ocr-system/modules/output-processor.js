const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');

class OutputProcessor {
  constructor(config) {
    this.config = config.output;
    this.ensureOutputDirectory();
  }

  /**
   * 确保输出目录存在
   */
  async ensureOutputDirectory() {
    try {
      await fs.mkdir(this.config.directory, { recursive: true });
    } catch (error) {
      console.warn('创建输出目录失败:', error.message);
    }
  }

  /**
   * 处理OCR结果并生成多种格式输出
   */
  async processResults(ocrResults, pdfMetadata = {}) {
    const outputs = {};
    
    for (const format of this.config.formats) {
      try {
        switch (format) {
          case 'txt':
            outputs.txt = await this.generateTextOutput(ocrResults, pdfMetadata);
            break;
          case 'json':
            outputs.json = await this.generateJsonOutput(ocrResults, pdfMetadata);
            break;
          case 'html':
            outputs.html = await this.generateHtmlOutput(ocrResults, pdfMetadata);
            break;
          default:
            console.warn(`不支持的输出格式: ${format}`);
        }
      } catch (error) {
        console.error(`生成 ${format} 格式输出失败:`, error.message);
      }
    }

    return outputs;
  }

  /**
   * 生成纯文本输出
   */
  async generateTextOutput(results, metadata) {
    const outputPath = path.join(this.config.directory, 'output.txt');
    
    let textContent = '';
    
    if (this.config.text.includePageNumbers) {
      textContent += `PDF文字识别结果\n`;
      textContent += `文件: ${metadata.title || '未知文件'}\n`;
      textContent += `总页数: ${metadata.numPages || '未知'}\n`;
      textContent += `生成时间: ${new Date().toLocaleString()}\n`;
      textContent += '='.repeat(50) + '\n\n';
    }

    // 按页码排序
    const sortedResults = results
      .filter(r => r.success)
      .sort((a, b) => a.pageNumber - b.pageNumber);

    for (const result of sortedResults) {
      if (this.config.text.includePageNumbers) {
        textContent += `第 ${result.pageNumber} 页\n`;
        textContent += '-'.repeat(30) + '\n';
      }
      
      if (this.config.text.preserveLayout) {
        textContent += result.text + '\n\n';
      } else {
        // 简化布局
        const cleanText = result.text
          .replace(/\n{3,}/g, '\n\n')
          .replace(/[\s\u3000]+/g, ' ') // 去除全角空格和多余空白
          .trim();
        textContent += cleanText + '\n\n';
      }
    }

    await fs.writeFile(outputPath, textContent, this.config.text.encoding);
    console.log(`📄 文本输出已保存: ${outputPath}`);
    
    return {
      path: outputPath,
      size: Buffer.byteLength(textContent, 'utf8'),
      pageCount: sortedResults.length
    };
  }

  /**
   * 生成结构化JSON输出
   */
  async generateJsonOutput(results, metadata) {
    const outputPath = path.join(this.config.directory, 'output.json');
    
    const structuredData = {
      metadata: {
        ...metadata,
        processedAt: new Date().toISOString(),
        totalPages: metadata.numPages,
        successfulPages: results.filter(r => r.success).length,
        failedPages: results.filter(r => !r.success).length
      },
      pages: []
    };

    // 处理成功的页面
    const successfulResults = results
      .filter(r => r.success)
      .sort((a, b) => a.pageNumber - b.pageNumber);

    for (const result of successfulResults) {
      const pageData = {
        pageNumber: result.pageNumber,
        text: result.text,
        statistics: {
          characterCount: result.text.length,
          lineCount: result.text.split('\n').length,
          wordCount: this.countWords(result.text),
          processingTime: result.processingTime
        }
      };

      if (this.config.json.includeConfidence && result.confidence) {
        pageData.confidence = {
          average: this.calculateAverageConfidence(result.confidence),
          distribution: this.getConfidenceDistribution(result.confidence),
          raw: result.confidence
        };

        // 过滤低置信度文本
        if (this.config.json.minConfidence > 0) {
          pageData.filteredText = this.filterLowConfidenceText(
            result.text, 
            result.confidence, 
            this.config.json.minConfidence
          );
        }
      }

      if (result.blocks && this.config.json.structured) {
        pageData.structure = {
          blocks: result.blocks,
          lines: result.lines,
          words: result.words
        };
      }

      structuredData.pages.push(pageData);
    }

    // 处理失败的页面
    const failedResults = results
      .filter(r => !r.success)
      .sort((a, b) => a.pageNumber - b.pageNumber);

    structuredData.failedPages = failedResults.map(result => ({
      pageNumber: result.pageNumber,
      error: result.error
    }));

    await fs.writeFile(outputPath, JSON.stringify(structuredData, null, 2), 'utf8');
    console.log(`📊 JSON输出已保存: ${outputPath}`);
    
    return {
      path: outputPath,
      size: Buffer.byteLength(JSON.stringify(structuredData), 'utf8'),
      pageCount: successfulResults.length
    };
  }

  /**
   * 生成HTML输出
   */
  async generateHtmlOutput(results, metadata) {
    const outputPath = path.join(this.config.directory, 'output.html');
    
    let htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDF文字识别结果 - ${metadata.title || '未知文件'}</title>
    <style>
        body { 
            font-family: 'SimSun', '宋体', serif; 
            line-height: 1.6; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            background-color: #f5f5f5;
        }
        .header { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            margin-bottom: 20px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .page { 
            background: white; 
            padding: 25px; 
            margin-bottom: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            page-break-inside: avoid;
        }
        .page-number { 
            font-weight: bold; 
            color: #666; 
            border-bottom: 2px solid #e0e0e0; 
            padding-bottom: 10px; 
            margin-bottom: 15px;
        }
        .content { 
            white-space: pre-wrap; 
            font-size: 16px; 
            line-height: 1.8;
        }
        .confidence-low { color: #ff4444; }
        .confidence-medium { color: #ff8800; }
        .confidence-high { color: #00c851; }
        .stats { 
            background: #e3f2fd; 
            padding: 15px; 
            border-radius: 6px; 
            margin-top: 15px; 
            font-size: 14px;
        }
        @media print {
            body { background: white; }
            .page { box-shadow: none; border: 1px solid #ddd; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📖 PDF文字识别结果</h1>
        <p><strong>文件:</strong> ${metadata.title || '未知文件'}</p>
        <p><strong>总页数:</strong> ${metadata.numPages || '未知'}</p>
        <p><strong>处理时间:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>成功页数:</strong> ${results.filter(r => r.success).length}</p>
    </div>
`;

    // 处理成功的页面
    const successfulResults = results
      .filter(r => r.success)
      .sort((a, b) => a.pageNumber - b.pageNumber);

    for (const result of successfulResults) {
      const avgConfidence = result.confidence 
        ? this.calculateAverageConfidence(result.confidence) 
        : 0;
      
      const confidenceClass = this.getConfidenceClass(avgConfidence);
      
      htmlContent += `
    <div class="page">
        <div class="page-number">
            第 ${result.pageNumber} 页 
            <span class="${confidenceClass}" style="font-size: 14px; margin-left: 15px;">
                置信度: ${(avgConfidence * 100).toFixed(1)}%
            </span>
        </div>
        <div class="content">${this.escapeHtml(result.text)}</div>
        <div class="stats">
            📊 统计: ${result.text.length} 字符 | ⏱️ 处理时间: ${result.processingTime}ms
        </div>
    </div>
`;
    }

    htmlContent += `
</body>
</html>`;

    await fs.writeFile(outputPath, htmlContent, 'utf8');
    console.log(`🌐 HTML输出已保存: ${outputPath}`);
    
    return {
      path: outputPath,
      size: Buffer.byteLength(htmlContent, 'utf8'),
      pageCount: successfulResults.length
    };
  }

  /**
   * 工具方法：计算平均置信度
   */
  calculateAverageConfidence(confidenceArray) {
    if (!confidenceArray || confidenceArray.length === 0) return 0;
    const valid = confidenceArray.filter(c => c > 0);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  }

  /**
   * 工具方法：获取置信度分布
   */
  getConfidenceDistribution(confidenceArray) {
    const distribution = { high: 0, medium: 0, low: 0 };
    
    confidenceArray.forEach(conf => {
      if (conf >= 0.8) distribution.high++;
      else if (conf >= 0.6) distribution.medium++;
      else distribution.low++;
    });
    
    return distribution;
  }

  /**
   * 工具方法：获取置信度CSS类
   */
  getConfidenceClass(confidence) {
    if (confidence >= 0.8) return 'confidence-high';
    if (confidence >= 0.6) return 'confidence-medium';
    return 'confidence-low';
  }

  /**
   * 工具方法：过滤低置信度文本
   */
  filterLowConfidenceText(text, confidenceArray, minConfidence) {
    // 简化实现：实际应根据字符级别的置信度过滤
    const avgConfidence = this.calculateAverageConfidence(confidenceArray);
    return avgConfidence >= minConfidence ? text : '';
  }

  /**
   * 工具方法：统计单词数（中文按字符数）
   */
  countWords(text) {
    // 中文文本通常按字符数计算
    return text.replace(/[\s\p{P}]/gu, '').length;
  }

  /**
   * 工具方法：HTML转义
   */
  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 创建压缩包
   */
  async createZipArchive(outputs, filename = 'ocr-results.zip') {
    const zipPath = path.join(this.config.directory, filename);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`📦 压缩包创建完成: ${zipPath} (${archive.pointer()} bytes)`);
        resolve(zipPath);
      });

      archive.on('error', reject);
      archive.pipe(output);

      // 添加所有输出文件
      Object.values(outputs).forEach(output => {
        if (output && output.path) {
          archive.file(output.path, { name: path.basename(output.path) });
        }
      });

      // 添加质量报告（如果有）
      const qualityReportPath = path.join(this.config.directory, 'quality-report.json');
      if (fs.existsSync(qualityReportPath)) {
        archive.file(qualityReportPath, { name: 'quality-report.json' });
      }

      archive.finalize();
    });
  }

  /**
   * 清理输出目录
   */
  async cleanupOutput() {
    try {
      const files = await fs.readdir(this.config.directory);
      const deletePromises = files
        .filter(file => file !== '.gitkeep') // 保留.gitkeep
        .map(file => fs.unlink(path.join(this.config.directory, file)));

      await Promise.all(deletePromises);
      console.log('输出目录清理完成');
    } catch (error) {
      console.warn('清理输出目录失败:', error.message);
    }
  }
}

module.exports = OutputProcessor;