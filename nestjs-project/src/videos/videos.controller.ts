import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CreateVideoDto } from './dto/create-video.dto';
import { PartUrlsDto } from './dto/part-urls.dto';
import {
  CreateVideoResponse,
  DeliveryUrlResponse,
  PartUrlsResponse,
  UploadedPartsResponse,
  VideoResponse,
} from './dto/video-response.dto';
import { VideosService } from './videos.service';

function ApiError(
  status: number,
  description: string,
): MethodDecorator & ClassDecorator {
  return ApiResponse({
    status,
    description,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  });
}

const ApiPublicId = ApiParam({
  name: 'publicId',
  description: 'Public 11-character video identifier',
  example: 'dQw4w9WgXcQ',
});

// Every route is owner-only while videos are drafts: another user's video and
// an unknown id both answer 404.
@ApiTags('videos')
@ApiBearerAuth('access-token')
@ApiError(401, 'Missing or invalid access token')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a draft video and start its multipart upload',
    description:
      'Validates the declared type and size, creates the video as a draft in `uploading` state and returns the part plan for a direct multipart upload to storage.',
  })
  @ApiResponse({ status: 201, type: CreateVideoResponse })
  @ApiError(400, 'Validation failed')
  @ApiError(413, 'VIDEO_TOO_LARGE — declared size above the limit')
  @ApiError(415, 'UNSUPPORTED_VIDEO_TYPE — MIME type not allowed')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVideoDto,
  ): Promise<CreateVideoResponse> {
    return this.videosService.initiateUpload(user.sub, dto);
  }

  @Get(':publicId')
  @ApiOperation({
    summary: 'Get a video',
    description: 'Owner view of a video, used to poll its processing status.',
  })
  @ApiPublicId
  @ApiResponse({ status: 200, type: VideoResponse })
  @ApiError(404, 'VIDEO_NOT_FOUND')
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
  ): Promise<VideoResponse> {
    return this.videosService.findOwned(publicId, user.sub);
  }

  @Get(':publicId/stream')
  @ApiOperation({
    summary: 'Get a streaming URL',
    description:
      'Returns a short-lived presigned URL served directly by the storage, which answers Range requests with 206 for progressive playback.',
  })
  @ApiPublicId
  @ApiResponse({ status: 200, type: DeliveryUrlResponse })
  @ApiError(404, 'VIDEO_NOT_FOUND')
  @ApiError(409, 'VIDEO_NOT_READY — processing has not finished')
  async stream(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
  ): Promise<DeliveryUrlResponse> {
    return this.videosService.getStreamUrl(publicId, user.sub);
  }

  @Get(':publicId/download')
  @ApiOperation({
    summary: 'Get a download URL',
    description:
      'Returns a short-lived presigned URL whose response is an attachment named after the original file.',
  })
  @ApiPublicId
  @ApiResponse({ status: 200, type: DeliveryUrlResponse })
  @ApiError(404, 'VIDEO_NOT_FOUND')
  @ApiError(409, 'VIDEO_NOT_READY — processing has not finished')
  async download(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
  ): Promise<DeliveryUrlResponse> {
    return this.videosService.getDownloadUrl(publicId, user.sub);
  }

  @Post(':publicId/upload/part-urls')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sign upload URLs for parts',
    description:
      'Returns presigned UploadPart URLs (public storage endpoint) for the requested part numbers.',
  })
  @ApiPublicId
  @ApiResponse({ status: 200, type: PartUrlsResponse })
  @ApiError(
    400,
    'Validation failed, or INVALID_PART_NUMBER — part outside 1..part_count',
  )
  @ApiError(404, 'VIDEO_NOT_FOUND')
  @ApiError(409, 'UPLOAD_NOT_IN_PROGRESS')
  async partUrls(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
    @Body() dto: PartUrlsDto,
  ): Promise<PartUrlsResponse> {
    return this.videosService.issuePartUrls(
      publicId,
      user.sub,
      dto.part_numbers,
    );
  }

  @Get(':publicId/upload/parts')
  @ApiOperation({
    summary: 'List uploaded parts',
    description: 'Lists the parts already stored, to resume an upload.',
  })
  @ApiPublicId
  @ApiResponse({ status: 200, type: UploadedPartsResponse })
  @ApiError(404, 'VIDEO_NOT_FOUND')
  @ApiError(409, 'UPLOAD_NOT_IN_PROGRESS')
  async uploadedParts(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
  ): Promise<UploadedPartsResponse> {
    return this.videosService.listUploadedParts(publicId, user.sub);
  }

  @Post(':publicId/upload/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Complete the upload',
    description:
      'Completes the multipart upload, checks the real size, moves the video to `processing` and enqueues its processing job.',
  })
  @ApiPublicId
  @ApiResponse({ status: 200, type: VideoResponse })
  @ApiError(
    400,
    'Validation failed, or UPLOAD_INCOMPLETE — missing or invalid parts; the upload stays open',
  )
  @ApiError(404, 'VIDEO_NOT_FOUND')
  @ApiError(409, 'UPLOAD_NOT_IN_PROGRESS')
  @ApiError(
    413,
    'VIDEO_TOO_LARGE — real size above the limit; the video is set to failed',
  )
  @ApiError(
    503,
    'PROCESSING_ENQUEUE_FAILED — processing could not be scheduled; the video is set to failed',
  )
  async complete(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<VideoResponse> {
    return this.videosService.completeUpload(publicId, user.sub, dto.parts);
  }

  @Delete(':publicId/upload')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Abort the upload',
    description:
      'Aborts the multipart upload in storage and marks the video failed (`upload_aborted`).',
  })
  @ApiPublicId
  @ApiResponse({ status: 204, description: 'Upload aborted' })
  @ApiError(404, 'VIDEO_NOT_FOUND')
  @ApiError(409, 'UPLOAD_NOT_IN_PROGRESS')
  async abort(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
  ): Promise<void> {
    await this.videosService.abortUpload(publicId, user.sub);
  }
}
