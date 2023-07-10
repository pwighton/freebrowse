import type {
	CreateVolumeResponseDto,
	CreateSurfaceResponseDto,
	GetProjectDto,
	GetProjectVolumeDto,
	GetProjectSurfaceDto,
	CreateOverlayResponseDto,
	CreateAnnotationResponseDto,
} from '@/generated/web-api-client';
import { CloudAnnotationFile } from '@/pages/project/models/file/CloudAnnotationFile';
import { CloudOverlayFile } from '@/pages/project/models/file/CloudOverlayFile';
import { CloudSurfaceFile } from '@/pages/project/models/file/CloudSurfaceFile';
import { CloudVolumeFile } from '@/pages/project/models/file/CloudVolumeFile';
import { LocalAnnotationFile } from '@/pages/project/models/file/LocalAnnotationFile';
import { LocalOverlayFile } from '@/pages/project/models/file/LocalOverlayFile';
import { LocalSurfaceFile } from '@/pages/project/models/file/LocalSurfaceFile';
import { LocalVolumeFile } from '@/pages/project/models/file/LocalVolumeFile';
import {
	FileType,
	ProjectFileBase,
	type ProjectFile,
} from '@/pages/project/models/file/ProjectFile';
import type { AnnotationFile } from '@/pages/project/models/file/type/AnnotationFile';
import type { OverlayFile } from '@/pages/project/models/file/type/OverlayFile';
import type { PointSetFile } from '@/pages/project/models/file/type/PointSetFile';
import type { SurfaceFile } from '@/pages/project/models/file/type/SurfaceFile';
import type { VolumeFile } from '@/pages/project/models/file/type/VolumeFile';

/**
 * mutable instance keeps the state of the project files
 * there are two kinds of files.
 * - the once loaded already
 * - the once the user opened from the drive, which need to get uploaded
 */
export class ProjectFiles {
	public readonly localSurfaces: readonly LocalSurfaceFile[];
	public readonly localVolumes: readonly LocalVolumeFile[];
	public readonly cloudSurfaces: readonly CloudSurfaceFile[];
	public readonly cloudVolumes: readonly CloudVolumeFile[];
	public readonly cachePointSets: readonly PointSetFile[];

	public readonly surfaces: readonly SurfaceFile[];
	public readonly volumes: readonly VolumeFile[];
	public readonly all: readonly ProjectFile[];

	/**
	 * the project files instance can be created
	 * - empty
	 * - from another project files instance
	 * - from a given backendState state
	 */
	constructor(
		initState?:
			| { backendState: GetProjectDto }
			| {
					projectFilesInstance: ProjectFiles;
					localSurfaces?: readonly LocalSurfaceFile[];
					localVolumes?: readonly LocalVolumeFile[];
					cloudSurfaces?: readonly CloudSurfaceFile[];
					cloudVolumes?: readonly CloudVolumeFile[];
					cachePointSets?: readonly PointSetFile[];
			  }
			| undefined
	) {
		if (initState === undefined) {
			// new empty class
			this.localSurfaces = [];
			this.localVolumes = [];
			this.cloudSurfaces = [];
			this.cloudVolumes = [];
			this.cachePointSets = [];
			this.surfaces = [];
			this.volumes = [];
			this.all = [];
			return;
		}

		if ('backendState' in initState) {
			// new class from given backend state
			this.localSurfaces = [];
			this.localVolumes = [];
			this.cloudVolumes = ProjectFiles.cloudFileFromVolumeDto(
				initState.backendState.volumes
			);
			this.cloudSurfaces = ProjectFiles.cloudFileFromSurfaceDto(
				initState.backendState.surfaces
			);
			this.cachePointSets = [];
			this.surfaces = [...this.cloudSurfaces, ...this.localSurfaces];
			this.volumes = [...this.cloudVolumes, ...this.localVolumes];
			this.all = [...this.surfaces, ...this.volumes];
			return;
		}

		// new class from given file set
		this.localSurfaces =
			initState.localSurfaces ?? initState.projectFilesInstance.localSurfaces;
		this.localVolumes =
			initState.localVolumes ?? initState.projectFilesInstance.localVolumes;
		this.cloudSurfaces =
			initState.cloudSurfaces ?? initState.projectFilesInstance.cloudSurfaces;
		this.cloudVolumes =
			initState.cloudVolumes ?? initState.projectFilesInstance.cloudVolumes;
		this.cachePointSets =
			initState.cachePointSets ?? initState.projectFilesInstance.cachePointSets;

		if (
			initState.localSurfaces !== undefined ||
			initState.cloudSurfaces !== undefined
		) {
			this.surfaces = [...this.localSurfaces, ...this.cloudSurfaces];
		} else {
			this.surfaces = initState.projectFilesInstance.surfaces;
		}

		if (
			initState.localVolumes !== undefined ||
			initState.cloudVolumes !== undefined
		) {
			this.volumes = [...this.localVolumes, ...this.cloudVolumes];
		} else {
			this.volumes = initState.projectFilesInstance.volumes;
		}

		if (
			initState.localSurfaces !== undefined ||
			initState.cloudSurfaces !== undefined ||
			initState.localVolumes !== undefined ||
			initState.cloudVolumes !== undefined
		) {
			this.all = [...this.surfaces, ...this.volumes];
		} else {
			this.all = initState.projectFilesInstance.all;
		}
	}

	/**
	 * immutable instance recreation for volumes
	 * for adapted file metadata like
	 * - order
	 * - isActive
	 * - isChecked
	 * - opacity
	 * - ...
	 */
	public fromAdaptedVolumes(newVolumes: VolumeFile[]): ProjectFiles {
		const localVolumes = newVolumes.filter(
			(volume): volume is LocalVolumeFile => volume instanceof LocalVolumeFile
		);
		const cloudVolumes = newVolumes.filter(
			(volume): volume is CloudVolumeFile => volume instanceof CloudVolumeFile
		);

		return new ProjectFiles({
			localVolumes,
			cloudVolumes,
			projectFilesInstance: this,
		});
	}

	/**
	 * when the user clicks on a volume, we want to highlight only that one volume as active and deactivate all the others
	 */
	public fromOneVolumeActivated(volume: VolumeFile): ProjectFiles {
		const localVolumes = this.localVolumes.map((file) =>
			file.from({ isActive: file === volume })
		);
		const localSurfaces = this.localSurfaces.map((file) =>
			file.from({ isActive: false })
		);
		const cloudVolumes = this.cloudVolumes.map((file) =>
			file.from({ isActive: file === volume })
		);
		const cloudSurfaces = this.cloudSurfaces.map((file) =>
			file.from({ isActive: false })
		);

		return new ProjectFiles({
			localVolumes,
			localSurfaces,
			cloudVolumes,
			cloudSurfaces,
			projectFilesInstance: this,
		});
	}

	/**
	 * immutable instance recreation for surfaces
	 * for adapted file metadata like
	 * - order
	 * - isActive
	 * - isChecked
	 * - opacity
	 * - ...
	 */
	public fromAdaptedSurfaces(newSurfaces: SurfaceFile[]): ProjectFiles {
		const localSurfaces = newSurfaces.filter(
			(surface): surface is LocalSurfaceFile =>
				surface instanceof LocalSurfaceFile
		);
		const cloudSurfaces = newSurfaces.filter(
			(surface): surface is CloudSurfaceFile =>
				surface instanceof CloudSurfaceFile
		);

		return new ProjectFiles({
			localSurfaces,
			cloudSurfaces,
			projectFilesInstance: this,
		});
	}

	/**
	 * when the user clicks on a surface, we want to highlight only that one surface as active and deactivate all the others
	 */
	public fromOneSurfaceActivated(surface: SurfaceFile): ProjectFiles {
		const localVolumes =
			this.localVolumes.find((file) => file.isActive) !== undefined
				? this.localVolumes.map((file) => file.from({ isActive: false }))
				: undefined;

		const localSurfaces = this.localSurfaces.map((file) =>
			file.from({ isActive: file === surface })
		);

		const cloudVolumes =
			this.cloudVolumes.find((file) => file.isActive) !== undefined
				? this.cloudVolumes.map((file) => file.from({ isActive: false }))
				: undefined;

		const cloudSurfaces = this.cloudSurfaces.map((file) =>
			file.from({ isActive: file === surface })
		);

		return new ProjectFiles({
			localVolumes,
			localSurfaces,
			cloudVolumes,
			cloudSurfaces,
			projectFilesInstance: this,
		});
	}

	/**
	 * for drop zone
	 * add list of added local files to the localFile list
	 */
	public fromAddedLocalFiles(files: File[]): ProjectFiles {
		const newFiles = files
			.map((newFile) => {
				// do not add if file name exists already
				if (this.all.find((file) => file.name === newFile.name) !== undefined)
					return undefined;
				switch (ProjectFileBase.typeFromFileExtension(newFile.name)) {
					case FileType.VOLUME:
						return new LocalVolumeFile(newFile);
					case FileType.SURFACE:
						return new LocalSurfaceFile(newFile);
				}
				return undefined;
			})
			.filter(
				(file): file is LocalSurfaceFile | LocalVolumeFile => file !== undefined
			);

		const newVolumes = newFiles.filter(
			(newFile): newFile is LocalVolumeFile =>
				newFile instanceof LocalVolumeFile
		);
		const localVolumes = [...this.localVolumes, ...newVolumes];

		const newSurfaces = newFiles.filter(
			(newFile): newFile is LocalSurfaceFile =>
				newFile instanceof LocalSurfaceFile
		);
		const localSurfaces = [...this.localSurfaces, ...newSurfaces];

		return new ProjectFiles({
			localVolumes,
			localSurfaces,
			projectFilesInstance: this,
		});
	}

	public fromDeletedFile(fileNameToDelete: string): ProjectFiles {
		const cloudSurfaces = [
			...this.cloudSurfaces.filter((file) => file.name !== fileNameToDelete),
		];
		const cloudVolumes = [
			...this.cloudVolumes.filter((file) => file.name !== fileNameToDelete),
		];
		const localSurfaces = [
			...this.localSurfaces.filter((file) => file.name !== fileNameToDelete),
		];
		const localVolumes = [
			...this.localVolumes.filter((file) => file.name !== fileNameToDelete),
		];

		return new ProjectFiles({
			cloudSurfaces,
			cloudVolumes,
			localSurfaces,
			localVolumes,
			projectFilesInstance: this,
		});
	}

	public fromUploadedSurfaces(
		uploadResponses: CreateSurfaceResponseDto[]
	): ProjectFiles {
		const cloudSurfaces = [
			...this.cloudSurfaces,
			...uploadResponses.map((uploadResponse) => {
				if (uploadResponse.id === undefined)
					throw new Error('there needs to be a id for each cloud file');
				if (uploadResponse.fileName === undefined)
					throw new Error('there needs to be a name for each cloud file');

				// workaround as long as we do not receive the size as response
				const localFile = this.localSurfaces.find(
					(localSurface) => localSurface.name === uploadResponse.fileName
				);

				if (localFile === undefined)
					throw new Error(
						'there should be a local file for each uploaded cloud file'
					);

				return new CloudSurfaceFile(
					uploadResponse.id,
					uploadResponse.fileName,
					localFile.size,
					localFile.isActive,
					localFile.isChecked,
					localFile.order,
					localFile.color
				);
			}),
		];

		const localSurfaces = [
			...this.localSurfaces.filter(
				(localSurface) =>
					!uploadResponses
						.map((uploadResponse) => uploadResponse.fileName)
						.includes(localSurface.name)
			),
		];

		return new ProjectFiles({
			cloudSurfaces,
			localSurfaces,
			projectFilesInstance: this,
		});
	}

	/**
	 * removes the local files and adding the uploaded once instead to the file state
	 */
	public fromUploadedVolumes(
		uploadResponses: CreateVolumeResponseDto[]
	): ProjectFiles {
		const cloudVolumes = [
			...this.cloudVolumes,
			...uploadResponses.map((uploadResponse) => {
				if (uploadResponse.id === undefined)
					throw new Error('there needs to be a id for each cloud file');
				if (uploadResponse.fileName === undefined)
					throw new Error('there needs to be a name for each cloud file');
				if (uploadResponse.fileSize === undefined)
					throw new Error('there needs to be a fileSize for each cloud file');
				if (uploadResponse.order === undefined)
					throw new Error('there needs to be a order for each cloud file');
				if (uploadResponse.opacity === undefined)
					throw new Error('there needs to be a opacity for each cloud file');

				// workaround as long as we do not receive the size as response
				const localFile = this.localVolumes.find(
					(localVolume) => localVolume.name === uploadResponse.fileName
				);

				if (localFile === undefined)
					throw new Error(
						'there should be a local file for each uploaded cloud file'
					);

				return new CloudVolumeFile(
					uploadResponse.id,
					uploadResponse.fileName,
					uploadResponse.fileSize,
					localFile.isActive,
					localFile.isChecked,
					uploadResponse.order,
					uploadResponse.opacity,
					uploadResponse.colorMap ?? CloudVolumeFile.DEFAULT_COLOR_MAP,
					uploadResponse.contrastMin,
					uploadResponse.contrastMax
				);
			}),
		];

		const localVolumes = [
			...this.localVolumes.filter(
				(localVolume) =>
					!uploadResponses
						.map((uploadResponse) => uploadResponse.fileName)
						.includes(localVolume.name)
			),
		];

		return new ProjectFiles({
			cloudVolumes,
			localVolumes,
			projectFilesInstance: this,
		});
	}

	public fromUploadedOverlays(
		surfaceId: number,
		createOverlayResponseDto: CreateOverlayResponseDto[]
	): ProjectFiles {
		const cloudSurfaces = this.cloudSurfaces.map((surface) =>
			surface.id === surfaceId
				? surface.from({
						overlayFiles: surface.overlayFiles.map((overlay) => {
							if (!(overlay instanceof LocalOverlayFile)) return overlay;
							const overlayDto = createOverlayResponseDto.find(
								(dto) => dto.fileName === overlay.name
							);
							if (overlayDto === undefined) return overlay;

							if (overlayDto.id === undefined)
								throw new Error('no id for uploaded overlay');
							if (overlayDto.fileName === undefined)
								throw new Error('no fileName  for uploaded overlay');
							if (overlayDto.fileSize === undefined)
								throw new Error('no fileSize for uploaded overlay');

							return new CloudOverlayFile(
								overlayDto.id,
								overlayDto.fileName,
								overlayDto.selected ?? false
							);
						}),
				  })
				: surface
		);

		return new ProjectFiles({
			cloudSurfaces,
			projectFilesInstance: this,
		});
	}

	public fromUploadedAnnotations(
		surfaceId: number,
		createAnnotationResponseDto: CreateAnnotationResponseDto[]
	): ProjectFiles {
		const cloudSurfaces = this.cloudSurfaces.map((surface) =>
			surface.id === surfaceId
				? surface.from({
						annotationFiles: surface.annotationFiles.map((annotation) => {
							if (!(annotation instanceof LocalAnnotationFile))
								return annotation;
							const annotationDto = createAnnotationResponseDto.find(
								(dto) => dto.fileName === annotation.name
							);
							if (annotationDto === undefined) return annotation;

							if (annotationDto.id === undefined)
								throw new Error('no id for uploaded annotation');
							if (annotationDto.fileName === undefined)
								throw new Error('no fileName  for uploaded annotation');
							if (annotationDto.fileSize === undefined)
								throw new Error('no fileSize for uploaded annotation');

							return new CloudAnnotationFile(
								annotationDto.id,
								annotationDto.fileName,
								annotationDto.selected ?? false
							);
						}),
				  })
				: surface
		);

		return new ProjectFiles({
			cloudSurfaces,
			projectFilesInstance: this,
		});
	}

	/**
	 * method to add a new local file as overlay to the given surface
	 */
	public fromAddedLocalSurfaceOverlay(
		surface: SurfaceFile,
		file: File
	): ProjectFiles {
		const isLocal = surface instanceof LocalSurfaceFile;
		const localSurfaces = isLocal
			? this.localSurfaces.map((localSurface) =>
					localSurface === surface
						? localSurface.fromAddOverlay(file)
						: localSurface
			  )
			: this.localSurfaces;

		const isCloud = surface instanceof CloudSurfaceFile;
		const cloudSurfaces = isCloud
			? this.cloudSurfaces.map((localSurface) =>
					localSurface === surface
						? localSurface.fromAddOverlay(file)
						: localSurface
			  )
			: this.cloudSurfaces;

		return new ProjectFiles({
			localSurfaces,
			cloudSurfaces,
			projectFilesInstance: this,
		});
	}

	/**
	 * method to add a new local file as annotation to the given surface
	 */
	public fromAddedLocalSurfaceAnnotation(
		surface: SurfaceFile,
		file: File
	): ProjectFiles {
		const isLocal = surface instanceof LocalSurfaceFile;
		const localSurfaces = isLocal
			? this.localSurfaces.map((localSurface) =>
					localSurface === surface
						? localSurface.fromAddAnnotation(file)
						: localSurface
			  )
			: this.localSurfaces;

		const isCloud = surface instanceof CloudSurfaceFile;
		const cloudSurfaces = isCloud
			? this.cloudSurfaces.map((localSurface) =>
					localSurface === surface
						? localSurface.fromAddAnnotation(file)
						: localSurface
			  )
			: this.cloudSurfaces;

		return new ProjectFiles({
			localSurfaces,
			cloudSurfaces,
			projectFilesInstance: this,
		});
	}

	/**
	 * method to delete a overlay file from a surface
	 */
	public fromDeletedOverlay(
		surfaceFile: SurfaceFile,
		overlayFile: OverlayFile
	): ProjectFiles {
		const localSurfaces = this.localSurfaces.map((thisSurface) =>
			thisSurface !== surfaceFile
				? thisSurface
				: thisSurface.fromDeleteOverlay(overlayFile)
		);
		const cloudSurfaces = this.cloudSurfaces.map((thisSurface) =>
			thisSurface !== surfaceFile
				? thisSurface
				: thisSurface.fromDeleteOverlay(overlayFile)
		);

		return new ProjectFiles({
			localSurfaces,
			cloudSurfaces,
			projectFilesInstance: this,
		});
	}

	/**
	 * method to delete a annotation file from a surface
	 */
	public fromDeletedAnnotation(
		surfaceFile: SurfaceFile,
		annotationFile: AnnotationFile
	): ProjectFiles {
		const localSurfaces = this.localSurfaces.map((thisSurface) =>
			thisSurface !== surfaceFile
				? thisSurface
				: thisSurface.fromDeleteAnnotation(annotationFile)
		);
		const cloudSurfaces = this.cloudSurfaces.map((thisSurface) =>
			thisSurface !== surfaceFile
				? thisSurface
				: thisSurface.fromDeleteAnnotation(annotationFile)
		);

		return new ProjectFiles({
			localSurfaces,
			cloudSurfaces,
			projectFilesInstance: this,
		});
	}

	public fromIsActiveOverlay(
		surfaceFile: SurfaceFile,
		overlayFile: OverlayFile
	): ProjectFiles {
		const cloudSurfaces = this.cloudSurfaces.map((surface) =>
			surface === surfaceFile
				? surface.from({
						overlayFiles: surface.overlayFiles.map((overlay) => {
							if (overlay !== overlayFile) return overlay.fromIsActive(false);
							if (overlay.isActive) return overlay.fromIsActive(false);
							return overlay.fromIsActive(true);
						}),
						annotationFiles: surface.annotationFiles.map((annotation) =>
							annotation.fromIsActive(false)
						),
				  })
				: surface
		);

		return new ProjectFiles({
			cloudSurfaces,
			projectFilesInstance: this,
		});
	}

	public fromIsActiveAnnotation(
		surfaceFile: SurfaceFile,
		annotationFile: AnnotationFile
	): ProjectFiles {
		const cloudSurfaces = this.cloudSurfaces.map((surface) =>
			surface === surfaceFile
				? surface.from({
						overlayFiles: surface.overlayFiles.map((overlay) =>
							overlay.fromIsActive(false)
						),
						annotationFiles: surface.annotationFiles.map((annotation) => {
							if (annotation !== annotationFile)
								return annotation.fromIsActive(false);
							if (annotation.isActive) return annotation.fromIsActive(false);
							return annotation.fromIsActive(true);
						}),
				  })
				: surface
		);

		return new ProjectFiles({
			cloudSurfaces,
			projectFilesInstance: this,
		});
	}

	private static cloudFileFromVolumeDto(
		fileModel: GetProjectVolumeDto[] | undefined
	): CloudVolumeFile[] {
		if (fileModel === undefined) return [];

		return fileModel.map<CloudVolumeFile>((fileDto) =>
			CloudVolumeFile.fromDto(fileDto)
		);
	}

	private static cloudFileFromSurfaceDto(
		fileModel: GetProjectSurfaceDto[] | undefined
	): CloudSurfaceFile[] {
		if (fileModel === undefined) return [];
		return fileModel.map<CloudSurfaceFile>((fileDto) =>
			CloudSurfaceFile.fromDto(fileDto)
		);
	}
}
