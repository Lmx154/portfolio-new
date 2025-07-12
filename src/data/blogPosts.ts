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
  }
];