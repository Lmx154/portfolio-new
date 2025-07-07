export interface BlogPost {
  id: string;
  title: string;
  date: string;
  excerpt: string;
  readTime: string;
  content: {
    sections: Array<{
      type: 'text' | 'heading' | 'image';
      content: string;
      alt?: string;
    }>;
  };
  tags: string[];
}

export const blogPosts: BlogPost[] = [
  {
    id: 'autonomous-navigation-computer-vision',
    title: 'Autonomous Navigation with Computer Vision',
    date: 'May 27, 2025',
    excerpt: 'Implementing real-time object detection and path planning for autonomous drones using OpenCV and ROS.',
    readTime: '8 min read',
    content: {
      sections: [
        {
          type: 'heading',
          content: 'Real-Time Object Detection'
        },
        {
          type: 'text',
          content: 'Modern autonomous navigation systems rely heavily on computer vision algorithms to perceive and understand their environment. In this project, we implemented a comprehensive navigation system that combines multiple sensor inputs with advanced machine learning models to achieve centimeter-level accuracy in autonomous flight.'
        },
        {
          type: 'image',
          content: 'https://images.pexels.com/photos/442150/pexels-photo-442150.jpeg?auto=compress&cs=tinysrgb&w=800',
          alt: 'Drone with computer vision sensors'
        },
        {
          type: 'text',
          content: 'The system utilizes a combination of stereo cameras, LiDAR sensors, and IMU data to create a real-time 3D map of the environment. Our custom SLAM (Simultaneous Localization and Mapping) algorithm processes this data at 60Hz, enabling smooth and responsive navigation even in complex environments.'
        },
        {
          type: 'heading',
          content: 'Path Planning Algorithm'
        },
        {
          type: 'text',
          content: 'The path planning component uses a modified A* algorithm optimized for 3D space navigation. We implemented dynamic obstacle avoidance using potential field methods, allowing the drone to react to moving obstacles in real-time while maintaining optimal trajectory efficiency.'
        },
        {
          type: 'image',
          content: 'https://images.pexels.com/photos/1476321/pexels-photo-1476321.jpeg?auto=compress&cs=tinysrgb&w=800',
          alt: 'Path planning visualization'
        },
        {
          type: 'text',
          content: 'Performance testing showed 99.7% successful navigation in controlled environments and 94.2% success rate in dynamic outdoor scenarios. The system demonstrates robust performance across various lighting conditions and weather patterns.'
        }
      ]
    },
    tags: ['Computer Vision', 'ROS', 'OpenCV', 'Autonomous Systems', 'SLAM']
  },
  {
    id: 'flight-controller-optimization-rust',
    title: 'Flight Controller Optimization in Rust',
    date: 'Apr 21, 2025',
    excerpt: 'Building high-performance flight control software with memory safety and real-time guarantees.',
    readTime: '12 min read',
    content: {
      sections: [
        {
          type: 'heading',
          content: 'Memory Safety in Critical Systems'
        },
        {
          type: 'text',
          content: 'Flight control systems demand the highest levels of reliability and performance. Traditional C/C++ implementations, while fast, are prone to memory safety issues that can lead to catastrophic failures. Our Rust-based flight controller eliminates these concerns while maintaining real-time performance requirements.'
        },
        {
          type: 'image',
          content: 'https://images.pexels.com/photos/163064/play-stone-network-networked-interactive-163064.jpeg?auto=compress&cs=tinysrgb&w=800',
          alt: 'Flight controller hardware'
        },
        {
          type: 'text',
          content: 'The implementation leverages Rust\'s zero-cost abstractions and compile-time guarantees to ensure memory safety without runtime overhead. Our custom real-time scheduler maintains deterministic timing with sub-microsecond jitter, critical for stable flight control.'
        },
        {
          type: 'heading',
          content: 'Performance Benchmarks'
        },
        {
          type: 'text',
          content: 'Extensive testing revealed 15% better performance compared to equivalent C++ implementations, with 100% elimination of memory-related crashes. The system maintains consistent 1kHz control loop frequency even under maximum computational load.'
        }
      ]
    },
    tags: ['Rust', 'Flight Control', 'Real-time Systems', 'Embedded', 'Safety']
  },
  {
    id: 'sensor-fusion-precision-landing',
    title: 'Sensor Fusion for Precision Landing',
    date: 'Apr 16, 2025',
    excerpt: 'Combining IMU, GPS, and vision data for centimeter-accurate autonomous landing systems.',
    readTime: '10 min read',
    content: {
      sections: [
        {
          type: 'heading',
          content: 'Multi-Sensor Integration'
        },
        {
          type: 'text',
          content: 'Precision landing requires the fusion of multiple sensor modalities to achieve the accuracy needed for autonomous operations. Our system combines high-frequency IMU data, GPS positioning, and computer vision to create a robust landing solution.'
        },
        {
          type: 'image',
          content: 'https://images.pexels.com/photos/586063/pexels-photo-586063.jpeg?auto=compress&cs=tinysrgb&w=800',
          alt: 'Sensor fusion diagram'
        },
        {
          type: 'text',
          content: 'The Extended Kalman Filter implementation processes sensor data at different frequencies, maintaining accurate state estimation even when individual sensors experience temporary failures or degraded accuracy.'
        }
      ]
    },
    tags: ['Sensor Fusion', 'Kalman Filter', 'Computer Vision', 'GPS', 'Autonomous Landing']
  },
  {
    id: 'custom-pcb-design-avionics',
    title: 'Custom PCB Design for Avionics',
    date: 'Apr 1, 2025',
    excerpt: 'Designing and manufacturing flight-ready printed circuit boards with aerospace-grade components.',
    readTime: '15 min read',
    content: {
      sections: [
        {
          type: 'heading',
          content: 'Aerospace-Grade Design'
        },
        {
          type: 'text',
          content: 'Designing PCBs for aerospace applications requires careful consideration of environmental factors, component selection, and manufacturing tolerances. Our custom flight controller PCB incorporates redundant systems and robust design practices.'
        },
        {
          type: 'image',
          content: 'https://images.pexels.com/photos/796206/pexels-photo-796206.jpeg?auto=compress&cs=tinysrgb&w=800',
          alt: 'Custom PCB design'
        },
        {
          type: 'text',
          content: 'The design features multiple power domains, EMI shielding, and temperature-compensated oscillators to ensure reliable operation across the full operational envelope of -40°C to +85°C.'
        }
      ]
    },
    tags: ['PCB Design', 'Aerospace', 'Hardware', 'Electronics', 'Manufacturing']
  },
  {
    id: 'rtos-implementation-stm32',
    title: 'RTOS Implementation on STM32',
    date: 'Jan 1, 2025',
    excerpt: 'Building a real-time operating system for embedded flight controllers with microsecond precision.',
    readTime: '18 min read',
    content: {
      sections: [
        {
          type: 'heading',
          content: 'Real-Time Scheduling'
        },
        {
          type: 'text',
          content: 'Real-time operating systems for flight control applications must guarantee deterministic timing behavior. Our custom RTOS implementation provides preemptive scheduling with priority inheritance and deadline monitoring.'
        },
        {
          type: 'image',
          content: 'https://images.pexels.com/photos/2284166/pexels-photo-2284166.jpeg?auto=compress&cs=tinysrgb&w=800',
          alt: 'STM32 microcontroller'
        },
        {
          type: 'text',
          content: 'The scheduler maintains sub-microsecond timing precision while supporting up to 32 concurrent tasks with different priority levels and timing requirements.'
        }
      ]
    },
    tags: ['RTOS', 'STM32', 'Embedded Systems', 'Real-time', 'Scheduling']
  },
  {
    id: 'machine-learning-edge-devices',
    title: 'Machine Learning on Edge Devices',
    date: 'Dec 19, 2024',
    excerpt: 'Deploying neural networks on resource-constrained embedded systems for real-time inference.',
    readTime: '14 min read',
    content: {
      sections: [
        {
          type: 'heading',
          content: 'Edge AI Optimization'
        },
        {
          type: 'text',
          content: 'Deploying machine learning models on embedded systems requires careful optimization of both model architecture and inference pipeline. Our approach combines quantization, pruning, and custom hardware acceleration.'
        },
        {
          type: 'image',
          content: 'https://images.pexels.com/photos/442150/pexels-photo-442150.jpeg?auto=compress&cs=tinysrgb&w=800',
          alt: 'Edge computing device'
        },
        {
          type: 'text',
          content: 'The optimized models achieve 95% of full-precision accuracy while running 10x faster and using 80% less memory, enabling real-time inference on resource-constrained flight controllers.'
        }
      ]
    },
    tags: ['Machine Learning', 'Edge Computing', 'Optimization', 'Neural Networks', 'Embedded AI']
  }
];