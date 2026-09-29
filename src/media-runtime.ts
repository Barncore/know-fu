import { run } from './process.js';
/** Argument arrays only. Existing Windows installs default to WSL; setup can select native tools. */
export class MediaRuntime {
  constructor(public runner=run, public platform=process.platform,
    public mode=process.env.KB_MEDIA_RUNTIME??(platform==='win32'?'wsl':'native'),
    public distro=process.env.KB_WSL_DISTRO??'Ubuntu'){
    if(!['wsl','native'].includes(mode))throw Error('KB_MEDIA_RUNTIME must be wsl or native');
  }
  async file(p:string){return this.mode==='wsl'?(await this.runner('wsl.exe',['-d',this.distro,'--exec','wslpath','-a',p])).stdout.trim():p;}
  async exec(command:string,args:string[],timeout=180000){return this.mode==='wsl'?this.runner('wsl.exe',['-d',this.distro,'--exec',command,...args],{timeout}):this.runner(command,args,{timeout});}
  async probe(p:string){return JSON.parse((await this.exec('ffprobe',['-v','error','-show_format','-show_streams','-of','json',await this.file(p)])).stdout);}
}
