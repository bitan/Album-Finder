{ pkgs, ... }: {
  # To learn more about how to use Nix to configure your environment
  # see: https://developers.google.com/idx/guides/customize-idx-env

  # Which nixpkgs channel to use. "stable-24.05" is recommended.
  channel = "stable-24.05";

  # A list of packages to install.
  # Correctly defines nodemon as a nodePackage.
  packages = [
    pkgs.nodejs_20
    pkgs.nodePackages.nodemon
  ];

  # Sets environment variables in the workspace.
  env = {};

  # IDX-specific configuration.
  idx = {
    # A list of VS Code extensions to install.
    extensions = [
      "dbaeumer.vscode-eslint"
      "google.gemini-cli-vscode-ide-companion"
    ];

    # Workspace lifecycle hooks.
    workspace = {
      # Runs when a workspace is first created.
      onCreate = {
        npm-install = "npm install";
      };
    };

    # Web preview configuration.
    previews = {
      enable = true;
      previews = {
        web = {
          # This command now correctly sets the PORT environment variable for your server.
          command = ["sh" "-c" "PORT=$PORT npm run dev"];
          manager = "web";
        };
      };
    };
  };
}
