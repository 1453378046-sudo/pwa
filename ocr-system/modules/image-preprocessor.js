const sharp = require('sharp');
const Jimp = require('jimp');
const path = require('path');

class ImagePreprocessor {
  constructor(config) {
    this.config = config.preprocessing;
  }

  /**
   * 执行完整的图像预处理流水线
   */
  async preprocessImage(imageBuffer, pageNumber) {
    try {
      console.log(`📊 开始预处理页面 ${pageNumber}`);
      
      let processedImage = imageBuffer;
      const steps = this.config.steps;
      
      // 按顺序执行预处理步骤
      for (const step of steps) {
        if (this.config.enabled) {
          console.log(`  执行步骤: ${step}`);
          processedImage = await this.executeStep(step, processedImage, pageNumber);
        }
      }

      console.log(`✅ 页面 ${pageNumber} 预处理完成`);
      return processedImage;
    } catch (error) {
      console.error(`❌ 页面 ${pageNumber} 预处理失败:`, error.message);
      throw error;
    }
  }

  /**
   * 执行单个预处理步骤
   */
  async executeStep(step, imageBuffer, pageNumber) {
    const params = this.config.parameters[step];
    
    switch (step) {
      case 'grayscale':
        return await this.convertToGrayscale(imageBuffer, params);
      
      case 'denoise':
        return await this.denoiseImage(imageBuffer, params);
      
      case 'contrast':
        return await this.enhanceContrast(imageBuffer, params);
      
      case 'binarization':
        return await this.binarizeImage(imageBuffer, params);
      
      case 'deskew':
        return await this.deskewImage(imageBuffer, params);
      
      default:
        console.warn(`未知的预处理步骤: ${step}`);
        return imageBuffer;
    }
  }

  /**
   * 灰度化处理
   */
  async convertToGrayscale(imageBuffer, params) {
    try {
      return await sharp(imageBuffer)
        .grayscale()
        .toBuffer();
    } catch (error) {
      throw new Error(`灰度化失败: ${error.message}`);
    }
  }

  /**
   * 图像去噪
   */
  async denoiseImage(imageBuffer, params) {
    try {
      const { method = 'median', kernelSize = 3 } = params;
      
      switch (method) {
        case 'median':
          return await sharp(imageBuffer)
            .median(kernelSize)
            .toBuffer();
        
        case 'gaussian':
          return await sharp(imageBuffer)
            .blur(kernelSize / 2)
            .toBuffer();
        
        default:
          return imageBuffer;
      }
    } catch (error) {
      throw new Error(`去噪失败: ${error.message}`);
    }
  }

  /**
   * 对比度增强
   */
  async enhanceContrast(imageBuffer, params) {
    try {
      const { method = 'histogram', alpha = 1.5, beta = 0 } = params;
      
      switch (method) {
        case 'histogram':
          // 使用直方图均衡化
          return await sharp(imageBuffer)
            .normalise()
            .toBuffer();
        
        case 'linear':
          // 线性对比度调整
          return await sharp(imageBuffer)
            .linear(alpha, beta)
            .toBuffer();
        
        default:
          return imageBuffer;
      }
    } catch (error) {
      throw new Error(`对比度增强失败: ${error.message}`);
    }
  }

  /**
   * 图像二值化
   */
  async binarizeImage(imageBuffer, params) {
    try {
      const { method = 'otsu', blockSize = 15, constant = 5 } = params;
      
      // 使用Jimp进行更高级的二值化处理
      const jimpImage = await Jimp.read(imageBuffer);
      
      switch (method) {
        case 'otsu':
          // Otsu自动阈值
          jimpImage.scan(0, 0, jimpImage.bitmap.width, jimpImage.bitmap.height, function(x, y, idx) {
            const gray = this.bitmap.data[idx];
            const threshold = 128; // 简化版，实际应实现Otsu算法
            this.bitmap.data[idx] = gray > threshold ? 255 : 0;
            this.bitmap.data[idx + 1] = gray > threshold ? 255 : 0;
            this.bitmap.data[idx + 2] = gray > threshold ? 255 : 0;
          });
          break;
        
        case 'adaptive':
          // 自适应阈值（简化实现）
          jimpImage.scan(0, 0, jimpImage.bitmap.width, jimpImage.bitmap.height, function(x, y, idx) {
            const gray = this.bitmap.data[idx];
            // 简单的局部阈值计算
            const localThreshold = this.calculateLocalThreshold(x, y, blockSize, constant);
            this.bitmap.data[idx] = gray > localThreshold ? 255 : 0;
            this.bitmap.data[idx + 1] = gray > localThreshold ? 255 : 0;
            this.bitmap.data[idx + 2] = gray > localThreshold ? 255 : 0;
          });
          break;
      }

      return await jimpImage.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
      throw new Error(`二值化失败: ${error.message}`);
    }
  }

  /**
   * 计算局部阈值（自适应二值化辅助方法）
   */
  calculateLocalThreshold(x, y, blockSize, constant) {
    // 简化实现，实际应计算局部区域的平均值
    return 128; // 返回固定阈值
  }

  /**
   * 倾斜校正
   */
  async deskewImage(imageBuffer, params) {
    try {
      const { maxAngle = 5 } = params;
      
      // 使用Jimp检测和校正倾斜
      const jimpImage = await Jimp.read(imageBuffer);
      
      // 简化实现：检测倾斜角度并旋转
      // 实际应使用Hough变换或投影轮廓分析
      const detectedAngle = await this.detectSkewAngle(jimpImage);
      
      if (Math.abs(detectedAngle) > 1) { // 只校正大于1度的倾斜
        jimpImage.rotate(detectedAngle, Jimp.RESIZE_BILINEAR);
      }

      return await jimpImage.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
      console.warn('倾斜校正失败，继续处理:', error.message);
      return imageBuffer; // 倾斜校正失败不影响后续处理
    }
  }

  /**
   * 检测图像倾斜角度
   */
  async detectSkewAngle(jimpImage) {
    // 简化实现，返回0度（不倾斜）
    // 实际应实现：
    // 1. 边缘检测
    // 2. Hough变换检测直线
    // 3. 计算主要角度
    return 0;
  }

  /**
   * 批量预处理图像
   */
  async batchPreprocess(images) {
    const results = [];
    
    for (const imageData of images) {
      try {
        const processedBuffer = await this.preprocessImage(
          imageData.buffer, 
          imageData.pageNumber
        );
        
        results.push({
          ...imageData,
          buffer: processedBuffer,
          processed: true
        });
      } catch (error) {
        console.error(`页面 ${imageData.pageNumber} 预处理失败，使用原始图像:`, error.message);
        results.push({
          ...imageData,
          processed: false
        });
      }
    }

    return results;
  }

  /**
   * 保存预处理后的图像（用于调试）
   */
  async saveProcessedImage(imageBuffer, pageNumber, outputDir) {
    try {
      const filename = `preprocessed_page_${pageNumber.toString().padStart(4, '0')}.png`;
      const outputPath = path.join(outputDir, filename);
      
      await sharp(imageBuffer)
        .png({ quality: this.config.parameters?.quality || 95 })
        .toFile(outputPath);
      
      console.log(`预处理图像已保存: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.warn('保存预处理图像失败:', error.message);
    }
  }
}

module.exports = ImagePreprocessor;