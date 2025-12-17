# .idx/dev.nix - Defines the development environment for this project.
# Each attribute in a set (the blocks enclosed in {})
# must be separated by a semicolon.
{ pkgs }: {
  channel = "stable-24.05";

  packages = [ pkgs.nodejs_20 pkgs.cacert ];

  env = {
    SPOTIFY_CLIENT_ID = "5d313ceab3504720b4edd0712d1e7758";
    SPOTIFY_CLIENT_SECRET = "82f0ad4bc06242ac8790cd5d13ffa58d";
  };

  idx = {
    extensions = [ "dbaeumer.vscode-eslint" ];

    workspace = {
      # This command runs ONCE when the workspace is created.
      onCreate = { "npm-install" = "npm install"; };
    };

    previews = {
      enable = true;
      previews = {
        web = {
          # This is the command that starts your web server.
          # We are using "npm run dev" to enable --watch for auto-reloading.
          command = ["npm" "run" "dev" "--" "--port" "$PORT"];
          manager = "web";
        };
      };
    };
  };
}
