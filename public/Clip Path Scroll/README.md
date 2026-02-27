# Clip Path Scroll Animation

A mesmerizing scroll animation demo inspired by Gabriel Contassot, featuring central fixed images that reveal and conceal themselves using clip-paths as you scroll.

## Features

- **Clip-Path Transitions**: Images transition with a wipe effect (revealing from bottom to top, concealing from bottom to top) synced to the scroll position.
- **Fixed Positioning**: The image container remains centered on the screen while the content (titles) scrolls.
- **Image Scaling**: Images subtly scale up as they remain in view, adding depth to the animation.
- **ScrollTrigger Integration**: Uses GSAP's ScrollTrigger plugin for precise control over animations based on scroll position.

## Technologies Used

- **HTML5 & CSS3**
- **JavaScript (ES6+)**
- **GSAP (GreenSock Animation Platform)**
- **ScrollTrigger Plugin**

## How to Run

1.  **Clone or Download** this repository.
2.  Open the project folder.
3.  Double-click `index.html` to view it in your browser.

## Project Structure

-   `index.html`: Main HTML structure containing the fixed intro copy, scrollable sections (titles), and the fixed container for image previews.
-   `styles.css`: CSS styling for the dark theme, typography, and fixed positioning of elements.
-   `script.js`: Key logic for the animation:
    *   `addImageScaleAnimation()`: Handles the zoom effect on images.
    *   `animateClipPath()`: Manages the reveal/hide transitions using `clip-path`.
-   `assets/`: Directory for images used in the preview sequence.

## Credits

Original concept by Gabriel Contassot, implemented by @Codegrid.
