import { AppDataSource } from "../configs/data-source.config";
import { TaskArtifact } from "../entities/TaskArtifact.entity";
import type { CreateTaskArtifactDto } from "../schemas/task_artifact.schema";

const artifactRepo = () => AppDataSource.getRepository(TaskArtifact);

export async function findArtifactsByTaskId(taskId: string): Promise<TaskArtifact[]> {
  return artifactRepo().find({
    where: { task_id: taskId },
    order: { sort_order: "ASC", created_at: "ASC" },
  });
}

export async function createArtifactsBulk(
  taskId: string,
  dtos: CreateTaskArtifactDto[]
): Promise<TaskArtifact[]> {
  const entities = dtos.map((dto, i) =>
    artifactRepo().create({
      task_id: taskId,
      type: dto.type,
      title: dto.title,
      content: dto.content,
      content_type: dto.content_type ?? "text/plain",
      metadata: dto.metadata ?? null,
      sort_order: dto.sort_order ?? i,
    })
  );
  return artifactRepo().save(entities);
}

export async function deleteArtifactsByTaskId(taskId: string): Promise<void> {
  await artifactRepo().softDelete({ task_id: taskId });
}
