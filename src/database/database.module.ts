import { Module, Global } from '@nestjs/common';
import { PgVectorService } from './pg-vector.service';

@Global()
@Module({
  providers: [PgVectorService],
  exports: [PgVectorService],
})
export class DatabaseModule {}
