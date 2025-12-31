const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { createCanvas } = require('canvas');

class PDFExtractor {
  constructor(config) {
    this.config = config;
    this.pdfDocument = null;
  }

  /**
   * 初始化PDF文档
   */
  async initialize(pdfBuffer) {
    try {
      // 设置PDF.js worker
      const pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

      this.pdfDocument = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
      console.log(`PDF文档加载成功，总页数: ${this.pdfDocument.numPages}`);
      return this.pdfDocument.numPages;
    } catch (error) {
      throw new Error(`PDF初始化失败: ${error.message}`);
    }
  }

  /**
   * 提取单页为高质量图像
   */
  async extractPageAsImage(pageNumber, outputPath = null) {
    try {
      const page = await this.pdfDocument.getPage(pageNumber);
      
      // 设置渲染参数
      const viewport = page.getViewport({ 
        scale: this.config.pdf.dpi / 72 
      });

      // 创建Canvas进行渲染
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      // 渲染页面
      await page.render(renderContext).promise;

      // 转换为Buffer
      const imageBuffer = canvas.toBuffer('image/png');

      // 如果需要保存文件
      if (outputPath) {
        await fs.writeFile(outputPath, imageBuffer);
        console.log(`页面 ${pageNumber} 已保存到: ${outputPath}`);
      }

      return {
        buffer: imageBuffer,
        width: viewport.width,
        height: viewport.height,
        pageNumber: pageNumber
      };
    } catch (error) {
      throw new Error(`提取页面 ${pageNumber} 失败: ${error.message}`);
    }
  }

  /**
   * 批量提取页面为图像
   */
  async extractPagesAsImages(startPage = 1, endPage = null, outputDir = './temp') {
    try {
      const totalPages = endPage || this.pdfDocument.numPages;
      const pagesToProcess = Math.min(totalPages - startPage + 1, this.config.batch.batchSize);
      
      console.log(`开始提取页面 ${startPage} 到 ${startPage + pagesToProcess - 1}`);

      const images = [];
      
      for (let i = 0; i < pagesToProcess; i++) {
        const currentPage = startPage + i;
        if (currentPage > this.pdfDocument.numPages) break;

        const outputPath = path.join(outputDir, `page_${currentPage.toString().padStart(4, '0')}.png`);
        
        try {
          const imageData = await this.extractPageAsImage(currentPage, outputPath);
          images.push({
            ...imageData,
            filePath: outputPath
          });

          console.log(`✅ 页面 ${currentPage}/${this.pdfDocument.numPages} 提取完成`);
        } catch (error) {
          console.error(`❌ 页面 ${currentPage} 提取失败:`, error.message);
        }
      }

      return images;
    } catch (error) {
      throw new Error(`批量提取页面失败: ${error.message}`);
    }
  }

  /**
   * 获取PDF元数据
   */
  async getMetadata() {
    try {
      const metadata = await this.pdfDocument.getMetadata();
      return {
        ...metadata,
        numPages: this.pdfDocument.numPages,
        isPureImage: await this.isPureImagePDF()
      };
    } catch (error) {
      console.warn('获取PDF元数据失败:', error.message);
      return {
        numPages: this.pdfDocument.numPages,
        isPureImage: false
      };
    }
  }

  /**
   * 检测是否为纯图像PDF
   */
  async isPureImagePDF() {
    try {
      // 抽样检测前5页
      const samplePages = Math.min(5, this.pdfDocument.numPages);
      let imagePageCount = 0;

      for (let i = 1; i <= samplePages; i++) {
        const page = await this.pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        
        // 如果页面没有文本内容，可能是图像页面
        if (!textContent.items || textContent.items.length === 0) {
          imagePageCount++;
        }
      }

      // 如果80%的抽样页面都是图像，认为是纯图像PDF
      return imagePageCount / samplePages >= 0.8;
    } catch (error) {
      console.warn('检测PDF类型失败:', error.message);
      return true; // 默认按图像处理
    }
  }

  /**
   * 清理临时文件
   */
  async cleanup(tempDir) {
    try {
      const files = await fs.readdir(tempDir);
      const deletePromises = files
        .filter(file => file.startsWith('page_') && file.endsWith('.png'))
        .map(file => fs.unlink(path.join(tempDir, file)));

      await Promise.all(deletePromises);
      console.log('临时文件清理完成');
    } catch (error) {
      console.warn('清理临时文件失败:', error.message);
    }
  }

  /**
   * 关闭PDF文档
   */
  async close() {
    if (this.pdfDocument) {
      this.pdfDocument.destroy();
      this.pdfDocument = null;
    }
  }
}

module.exports = PDFExtractor;