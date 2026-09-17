import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { loadConfig } from './config/env.js';
import { logger } from './utils/logger.js';
import { generatePrompt } from './content/prompt-generator.js';
import { generateCaption } from './content/caption-generator.js';
import { validateImageForInstagram } from './utils/validation.js';
import { GeminiService } from './services/gemini.service.js';
import { StorageService } from './services/storage.service.js';
import { InstagramService } from './services/instagram.service.js';
import { StateService } from './services/state.service.js';

/**
 * Main application orchestrator for the Instagram AI Publisher.
 */
export async function runPublisher(customConfig = null) {
  const executionId = `exec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  logger.stage('STARTING', { executionId });

  // 1. Load and validate environment configuration
  const config = customConfig || loadConfig();
  logger.info(
    `Configuration loaded successfully. Dry Run: ${config.dryRun}. Gemini Model: '${config.gemini.model}'.`
  );

  // 2. Initialize external integration services
  const geminiService = new GeminiService({
    apiKey: config.gemini.apiKey,
    model: config.gemini.model,
    maxRetries: config.resilience.maxRetries,
    timeoutMs: config.resilience.requestTimeoutMs,
  });

  const storageService = new StorageService({
    url: config.supabase.url,
    serviceRoleKey: config.supabase.serviceRoleKey,
    bucket: config.supabase.bucket,
    useSignedUrl: config.supabase.useSignedUrl,
    signedUrlExpiresIn: config.supabase.signedUrlExpiresIn,
    isDryRun: config.dryRun,
    maxRetries: config.resilience.maxRetries,
  });

  const instagramService = new InstagramService({
    accessToken: config.instagram.accessToken,
    userId: config.instagram.userId,
    apiVersion: config.instagram.apiVersion,
    maxRetries: config.resilience.maxRetries,
    timeoutMs: config.resilience.requestTimeoutMs,
  });

  const stateService = StateService.create(config, storageService);

  // 3. Generate Content Prompt for THIMMA KANNAN SHOP
  logger.stage('GENERATING_PROMPT');
  const content = generatePrompt({
    aspectRatio: config.post.aspectRatio,
  });
  logger.info(
    `Generated content prompt for '${content.brand}' [Theme: '${content.theme}'].`,
    {
      brand: content.brand,
      theme: content.theme,
      promptHash: content.hash,
    }
  );
  logger.debug('Prompt text:', { prompt: content.prompt });

  // 4. Check Idempotency
  logger.stage('CHECKING_IDEMPOTENCY');
  const duplicateCheck = await stateService.checkDuplicate(content.hash);
  if (duplicateCheck.isDuplicate) {
    logger.warn('Duplicate prompt detected within idempotency window. Skipping to prevent duplicate post.', {
      lastPublished: duplicateCheck.lastPublished,
    });
    return {
      status: 'SKIPPED_DUPLICATE',
      executionId,
      promptHash: content.hash,
      reason: 'Prompt was recently published.',
    };
  }

  // 5. Call Gemini Image Generation API (Nano Banana)
  logger.stage('GENERATING_IMAGE');
  const { buffer: imageBuffer, mimeType } = await geminiService.generateImage(content.prompt, {
    aspectRatio: config.post.aspectRatio,
  });
  logger.stage('IMAGE_GENERATED', { bytes: imageBuffer.length, mimeType });

  // Validate generated image parameters against Meta guidelines
  const imageValidation = validateImageForInstagram(imageBuffer, {
    width: config.post.imageWidth,
    height: config.post.imageHeight,
    mimeType,
  });
  if (!imageValidation.valid) {
    logger.warn('Image validation warnings for Instagram API:', imageValidation.errors);
  }

  // 6. Generate Unique Instagram Caption based on theme and brand
  logger.stage('GENERATING_CAPTION');
  const caption = config.post.customCaption
    ? config.post.caption
    : generateCaption({
        brand: content.brand,
        theme: content.theme,
        contentContext: content.imageContext || content.prompt,
      });
  logger.stage('CAPTION_GENERATED', { length: caption.length });
  logger.info(`Generated Instagram Caption:\n${caption}`);

  // 7. Upload Image to Storage and obtain public HTTPS URL
  logger.stage('UPLOADING_IMAGE');
  const { url: imageUrl, path: storagePath } = await storageService.uploadImage(imageBuffer, {
    mimeType,
  });
  logger.stage('IMAGE_UPLOADED', { storagePath, imageUrl });

  // 8. Handle DRY RUN Mode
  if (config.dryRun) {
    logger.stage('DRY_RUN_COMPLETED');
    console.log('\n======================================================');
    console.log('                INSTAGRAM AI PUBLISHER                ');
    console.log('                 (DRY RUN SUCCESSFUL)                 ');
    console.log('======================================================');
    console.log(`Execution ID : ${executionId}`);
    console.log(`Brand        : ${content.brand}`);
    console.log(`Theme        : ${content.theme}`);
    console.log(`Gemini Model : ${config.gemini.model}`);
    console.log(`Image Size   : ${(imageBuffer.length / 1024).toFixed(1)} KB`);
    console.log('\nCaption:\n' + caption);
    console.log(`\nImage URL    : ${imageUrl}`);
    console.log('Instagram API: Publishing skipped because DRY_RUN=true');
    console.log('======================================================\n');

    await stateService.recordPublication({
      executionId,
      mediaId: 'dry-run-skipped',
      promptHash: content.hash,
      imageUrl,
      prompt: content.prompt,
      caption,
      isDryRun: true,
    });

    return {
      status: 'DRY_RUN_SUCCESS',
      executionId,
      imageUrl,
      caption,
      brand: content.brand,
      theme: content.theme,
    };
  }

  // 9. Verify Instagram Account Access
  logger.stage('VERIFYING_ACCOUNT');
  const account = await instagramService.getInstagramAccount();

  // 10. Create Instagram Media Container
  logger.stage('CREATING_INSTAGRAM_MEDIA');
  const container = await instagramService.createMediaContainer(imageUrl, caption);
  logger.stage('MEDIA_CREATED', { containerId: container.id });

  // 11. Wait for Media Processing (Safe polling)
  logger.stage('CHECKING_MEDIA_STATUS');
  await instagramService.waitForMediaContainerReady(container.id);

  // 12. Publish Media Container
  logger.stage('PUBLISHING_MEDIA');
  const publishResult = await instagramService.publishMedia(container.id);
  const mediaId = publishResult.id;
  logger.stage('PUBLISHED', { mediaId });

  // 13. Record Successful State for Idempotency
  logger.stage('RECORDING_STATE');
  await stateService.recordPublication({
    executionId,
    mediaId,
    promptHash: content.hash,
    imageUrl,
    prompt: content.prompt,
    caption,
    isDryRun: false,
  });

  logger.stage('COMPLETED', {
    executionId,
    mediaId,
    account: account.username || account.id,
  });

  console.log('\n======================================================');
  console.log('                INSTAGRAM AI PUBLISHER                ');
  console.log('======================================================');
  console.log(`Execution ID : ${executionId}`);
  console.log(`Brand        : ${content.brand}`);
  console.log(`Theme        : ${content.theme}`);
  console.log(`Gemini Model : ${config.gemini.model}`);
  console.log(`Image Size   : ${(imageBuffer.length / 1024).toFixed(1)} KB`);
  console.log('\nCaption:\n' + caption);
  console.log(`\nImage URL    : ${imageUrl}`);
  console.log('Instagram    : Published');
  console.log(`Media ID     : ${mediaId}`);
  console.log('======================================================\n');

  return {
    status: 'SUCCESS',
    executionId,
    mediaId,
    imageUrl,
    caption,
    brand: content.brand,
    theme: content.theme,
  };
}

// Auto-run if executed directly as script entrypoint
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  runPublisher()
    .then((result) => {
      logger.info('Process exited cleanly.', result);
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Fatal execution error:', err);
      process.exit(1);
    });
}
