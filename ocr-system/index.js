#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const { program } = require('commander');

// 导入配置和模块
const config = require('./config/config');
const PDFExtractor = require('./modules/pdf-extractor');
const ImagePreprocessor = require('./modules/image-preprocessor');
const OCRProcessor = require('./modules/ocr-processor');
const OutputProcessor = require('./modules/output-processor');
const BatchProcessor = require('./modules/batch-processor');

// 模块集合
const modules = {
  PDFExtractor,
  ImagePreprocessor,
  OCRProcessor,
  OutputProcessor,
  BatchProcessor
};

/**
 * 主处理函数
 */
async function main() {
  try {
    console.log(chalk.blue.bold('\n🎯 古籍OCR文字识别系统'));
    console.log(chalk.gray('='.repeat(50)));
    
    // 解析命令行参数
    program
      .version('1.0.0')
      .description('高效OCR系统，专门处理古籍PDF文件')
      .argument('<pdf-file>', '要处理的PDF文件路径')
      .option('-o, --output <dir>', '输出目录', './output')
      .option('-b, --batch-size <size>', '批次大小', parseInt, 10)
      .option('-c, --concurrent <number>', '并发处理数', parseInt, 4)
      .option('--no-preprocess', '跳过图像预处理')
      .option('--debug', '启用调试模式')
      .parse(process.argv);

    const options = program.opts();
    const pdfFilePath = program.args[0];

    // 验证文件存在
    if (!await fileExists(pdfFilePath)) {
      throw new Error(`PDF文件不存在: ${pdfFilePath}`);
    }

    // 读取PDF文件
    console.log(chalk.blue('📖 读取PDF文件...'));
    const pdfBuffer = await fs.readFile(pdfFilePath);
    
    // 更新配置
    const updatedConfig = {
      ...config,
      output: {
        ...config.output,
        directory: options.output
      },
      batch: {
        ...config.batch,
        batchSize: options.batchSize,
        maxConcurrent: options.concurrent
      },
      preprocessing: {
        ...config.preprocessing,
        enabled: options.preprocess
      }
    };

    // 创建批处理器
    const batchProcessor = new BatchProcessor(updatedConfig, modules);
    
    // 开始处理
    const result = await batchProcessor.processPDF(pdfBuffer, options);
    
    if (result.success) {
      console.log(chalk.green.bold('\n✨ 处理完成!'));
      
      // 显示输出文件信息
      const outputDir = updatedConfig.output.directory;
      const files = await fs.readdir(outputDir);
      
      console.log(chalk.blue('\n📁 生成的文件:'));
      files.forEach(file => {
        console.log(chalk.gray(`  📄 ${path.join(outputDir, file)}`));
      });
      
    } else {
      console.log(chalk.red.bold('\n❌ 处理失败!'));
      console.log(chalk.red(`错误: ${result.error}`));
      process.exit(1);
    }
    
  } catch (error) {
    console.error(chalk.red.bold('\n💥 系统错误:'));
    console.error(chalk.red(error.message));
    
    if (error.stack && program.opts().debug) {
      console.error(chalk.gray(error.stack));
    }
    
    process.exit(1);
  }
}

/**
 * 检查文件是否存在
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 处理单个PDF文件（API方式）
 */
async function processSinglePDF(pdfBuffer, options = {}) {
  const batchProcessor = new BatchProcessor(config, modules);
  return await batchProcessor.processPDF(pdfBuffer, options);
}

/**
 * 处理多个PDF文件（API方式）
 */
async function processMultiplePDFs(pdfFiles, options = {}) {
  const batchProcessor = new BatchProcessor(config, modules);
  return await batchProcessor.processMultiplePDFs(pdfFiles, options);
}

// 导出API函数
module.exports = {
  processSinglePDF,
  processMultiplePDFs,
  config,
  modules
};

// 如果是直接执行
if (require.main === module) {
  main().catch(console.error);
}