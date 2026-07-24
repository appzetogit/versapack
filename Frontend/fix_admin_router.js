const fs = require('fs');
const path = '/home/aman-kuril/Desktop/projects2/Appzeto-Master1/Frontend/src/modules/Food/components/admin/AdminRouter.jsx';
let content = fs.readFileSync(path, 'utf8');

const insertContent = `
  // Safely enforce light mode for the Admin app to prevent User dark mode bleeding
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    return () => {
      const savedTheme = localStorage.getItem('appTheme') || 'light';
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    };
  }, []);
`;

content = content.replace(
  'export default function AdminRouter() {',
  'export default function AdminRouter() {\n' + insertContent
);

fs.writeFileSync(path, content);
console.log("AdminRouter updated successfully!");
