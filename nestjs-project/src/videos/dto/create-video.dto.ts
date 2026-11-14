import { IsInt, IsNotEmpty, IsString, Length, Min } from 'class-validator';

export class CreateVideoDto {
  /** Original file name, e.g. `aula.mp4`; the title defaults to it without the extension. */
  @IsString()
  @Length(1, 255)
  filename: string;

  /** Declared MIME type; must be in the configured allowlist. */
  @IsString()
  @IsNotEmpty()
  mime_type: string;

  /** Declared file size in bytes; must not exceed the configured maximum (10 GiB by default). */
  @IsInt()
  @Min(1)
  size_bytes: number;
}
