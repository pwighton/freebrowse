## Major Modes of operation
-------------------------------------------------------------------

FreeBrowse supports two major modes of operation
- Serverless
- Fullstack

Serverless mode is available at [github.com/freesurfer/freebrowse](github.com/freesurfer/freebrowse).  Fullstack mode is available by cloning the repository and following the installation instructions.  

The following features are only available in Fullstack mode:
- Saving and retriving volumes and niivue documents to the backend
- AI intergration (experimental, work in progress)

## Loading data
-------------------------------------------------------------------

Data can either be loaded from disk, via URL or from the backend (Fullstack mode only)

### Loading data from disk

**Note**: When loading data from disk into freebrowse, **no data leaves your computer**.

- **Load a volume from disk**:
  - When no data is loaded, you can click 'Select Files' in the center of the display, or drag volumetric files from your file browser.  Currelty, nifti (`.nii`, `.nii.gz`) and [`.mgz`](https://surfer.nmr.mgh.harvard.edu/fswiki/FsTutorial/MghFormat) are supported
    - ![Select Files](img/select-file.png)
  - When data is already loaded, you can add volumetric data to the current scene by selecting the 'Volumetric Details' tab in the sidebar
    - ![Volumetric Details](img/vol-details.png)
    - And then selecting 'Load volumes'
    - ![Load volumes](img/load-vol.png)

- **Load a surface from disk**
- Load niivue document

### Loading data via URL

The URL parameters `vol` and `nvd` can be used to generate links that will automatically load data

- Load volume with `vol` parameter example
- Load scene with `nvd` parameter example

See niivue documents

### Loading data from the backend

**Fullstack mode only**

## Saving data
-------------------------------------------------------------------

Data can either be saved to disk or to the backend (Fullstack mode only)

### Saving data to disk

- Saving volumes
- Saving niivue documents

### Saving data to the backend

- Saving volumes
- Saving niivue documents

### Notes

- Explain differences between saving niivue documents to disk vs backend
- Since editing of surfaces is not supported, saving of surfaces is not supported

## Navigation
-------------------------------------------------------------------

### Top panel

- View Modes
- Drag Modes
- Settings

### Sidebar

- Volumetric Details
- Surface Details
- Drawing Tools
- AI annotation (Fullstack mode only)
- Backend: NiiVue Documents (Fullstack mode only)
- Backend: Imaging Data (Fullstack mode only)

### Footer

## Other Modes of operation
-------------------------------------------------------------------

- Singlefile
- Jupyter

