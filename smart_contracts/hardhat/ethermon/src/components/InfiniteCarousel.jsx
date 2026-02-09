import { useRef, useEffect } from 'react';

export function InfiniteCarousel({ children, speed = 30 }) {
    const scrollRef = useRef(null);
    const animationRef = useRef(null);

    useEffect(() => {
        const scrollContainer = scrollRef.current;
        if (!scrollContainer) return;

        let scrollPos = 0;
        const contentWidth = scrollContainer.scrollWidth / 2;

        function animate() {
            scrollPos += 0.5;

            // Reset when we've scrolled past the first set
            if (scrollPos >= contentWidth) {
                scrollPos = 0;
            }

            scrollContainer.scrollLeft = scrollPos;
            animationRef.current = requestAnimationFrame(animate);
        }

        animationRef.current = requestAnimationFrame(animate);

        // Pause on hover
        const handleMouseEnter = () => cancelAnimationFrame(animationRef.current);
        const handleMouseLeave = () => {
            animationRef.current = requestAnimationFrame(animate);
        };

        scrollContainer.addEventListener('mouseenter', handleMouseEnter);
        scrollContainer.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            cancelAnimationFrame(animationRef.current);
            scrollContainer.removeEventListener('mouseenter', handleMouseEnter);
            scrollContainer.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [children]);

    return (
        <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-hidden py-4"
            style={{ scrollBehavior: 'auto' }}
        >
            {/* Duplicate children for seamless loop */}
            {children}
            {children}
        </div>
    );
}
